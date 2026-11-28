-- ILS Service Mart quotation lifecycle.
-- Separate from legacy complaint-passport quote tables. No existing order or enquiry price is changed.

create table if not exists public.ils_matter_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  client_requirement_id bigint not null references public.client_requirements(id) on delete restrict,
  source_service_request_id uuid not null references public.service_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  government_fee numeric(12,2) not null default 0 check (government_fee >= 0),
  ils_fee numeric(12,2) not null default 0 check (ils_fee >= 0),
  professional_fee numeric(12,2) not null default 0 check (professional_fee >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_before_credit numeric(12,2) not null default 0 check (total_before_credit >= 0),
  enquiry_credit_amount numeric(12,2) not null default 0 check (enquiry_credit_amount >= 0),
  total_customer_payable numeric(12,2) not null default 0 check (total_customer_payable >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  scope_of_work text not null,
  inclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  exclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  cancellation_rule text,
  refund_rule text,
  valid_until timestamptz not null,
  quote_status text not null default 'DRAFT' check (quote_status in ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  enquiry_order_id uuid references public.orders(id) on delete restrict,
  final_service_request_id uuid references public.service_requests(id) on delete restrict,
  final_order_id uuid references public.orders(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  sent_by uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  declined_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  updated_at timestamptz not null default now(),
  check (total_before_credit = government_fee + ils_fee + professional_fee + tax_amount),
  check (total_customer_payable = greatest(0, total_before_credit - enquiry_credit_amount)),
  check (enquiry_credit_amount <= ils_fee)
);

create index if not exists idx_ils_matter_quotes_lead_created
  on public.ils_matter_quotes(client_requirement_id, created_at desc);
create index if not exists idx_ils_matter_quotes_user_status
  on public.ils_matter_quotes(user_id, quote_status, created_at desc);
create unique index if not exists uq_ils_matter_quotes_one_accepted_per_request
  on public.ils_matter_quotes(source_service_request_id)
  where quote_status = 'ACCEPTED';
create unique index if not exists uq_ils_matter_quotes_final_order
  on public.ils_matter_quotes(final_order_id) where final_order_id is not null;

create table if not exists public.ils_matter_quote_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  enquiry_order_id uuid not null unique references public.orders(id) on delete restrict,
  quote_id uuid not null unique references public.ils_matter_quotes(id) on delete restrict,
  client_requirement_id bigint not null references public.client_requirements(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.ils_matter_quotes enable row level security;
alter table public.ils_matter_quote_credit_ledger enable row level security;
revoke all on public.ils_matter_quotes, public.ils_matter_quote_credit_ledger from public, anon, authenticated;
grant select, insert, update, delete on public.ils_matter_quotes, public.ils_matter_quote_credit_ledger to service_role;

create or replace function public.ils_admin_list_matter_quotes(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_limit integer := greatest(1,least(coalesce(p_limit,100),250));
begin
  if v_user is null or not coalesce(public.ils_is_admin(),false) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc)
    from (
      select q.id,q.quote_number,q.client_requirement_id,q.source_service_request_id,q.user_id,
        q.government_fee,q.ils_fee,q.professional_fee,q.tax_amount,q.total_before_credit,
        q.enquiry_credit_amount,q.total_customer_payable,q.currency,q.scope_of_work,
        q.inclusions,q.exclusions,q.cancellation_rule,q.refund_rule,q.valid_until,
        q.quote_status,q.enquiry_order_id,q.final_order_id,fo.status as final_order_status,
        q.created_at,q.sent_at,q.accepted_at,
        cr.client_name,cr.mobile,cr.legal_matter
      from public.ils_matter_quotes q
      join public.client_requirements cr on cr.id=q.client_requirement_id
      left join public.orders fo on fo.id=q.final_order_id
      order by q.created_at desc limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$$;

create or replace function public.ils_admin_save_matter_quote(
  p_quote_id uuid,
  p_service_request_id uuid,
  p_government_fee numeric,
  p_ils_fee numeric,
  p_professional_fee numeric,
  p_tax_amount numeric,
  p_scope_of_work text,
  p_inclusions jsonb,
  p_exclusions jsonb,
  p_valid_until timestamptz,
  p_cancellation_rule text default null,
  p_refund_rule text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_request public.service_requests%rowtype;
  v_quote public.ils_matter_quotes%rowtype;
  v_total numeric(12,2);
  v_quote_id uuid;
  v_number text;
begin
  if v_user is null or not coalesce(public.ils_is_admin(),false) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_service_request_id is null then raise exception 'SERVICE_REQUEST_REQUIRED'; end if;
  if p_government_fee is null or p_ils_fee is null or p_professional_fee is null or p_tax_amount is null
     or least(p_government_fee,p_ils_fee,p_professional_fee,p_tax_amount) < 0 then
    raise exception 'INVALID_QUOTE_AMOUNT';
  end if;
  if nullif(trim(coalesce(p_scope_of_work,'')),'') is null or length(p_scope_of_work)>5000 then
    raise exception 'INVALID_QUOTE_SCOPE';
  end if;
  if p_valid_until is null or p_valid_until <= now() or p_valid_until > now()+interval '90 days' then
    raise exception 'INVALID_QUOTE_VALIDITY';
  end if;
  if jsonb_typeof(coalesce(p_inclusions,'[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_exclusions,'[]'::jsonb))<>'array' then
    raise exception 'INVALID_QUOTE_LISTS';
  end if;
  select * into v_request from public.service_requests where id=p_service_request_id for update;
  if not found or v_request.user_id is null or v_request.client_requirement_id is null then
    raise exception 'LINKED_CUSTOMER_ENQUIRY_REQUIRED';
  end if;
  if p_quote_id is not null then
    select * into v_quote from public.ils_matter_quotes where id=p_quote_id for update;
    if not found or v_quote.quote_status<>'DRAFT' then raise exception 'DRAFT_QUOTE_NOT_FOUND'; end if;
    if v_quote.source_service_request_id<>v_request.id or v_quote.user_id<>v_request.user_id then
      raise exception 'QUOTE_MATTER_MISMATCH';
    end if;
    v_quote_id:=v_quote.id;
    v_number:=v_quote.quote_number;
  else
    v_quote_id:=gen_random_uuid();
    v_number:='ILS-Q-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_quote_id::text,'-',''),1,8));
  end if;
  v_total:=round(p_government_fee+p_ils_fee+p_professional_fee+p_tax_amount,2);
  if p_quote_id is null then
    insert into public.ils_matter_quotes(
      id,quote_number,client_requirement_id,source_service_request_id,user_id,
      government_fee,ils_fee,professional_fee,tax_amount,total_before_credit,
      total_customer_payable,scope_of_work,inclusions,exclusions,cancellation_rule,
      refund_rule,valid_until,created_by
    ) values (
      v_quote_id,v_number,v_request.client_requirement_id,v_request.id,v_request.user_id,
      p_government_fee,p_ils_fee,p_professional_fee,p_tax_amount,v_total,v_total,
      trim(p_scope_of_work),coalesce(p_inclusions,'[]'::jsonb),coalesce(p_exclusions,'[]'::jsonb),
      nullif(trim(p_cancellation_rule),''),nullif(trim(p_refund_rule),''),p_valid_until,v_user
    );
  else
    update public.ils_matter_quotes set
      government_fee=p_government_fee,ils_fee=p_ils_fee,professional_fee=p_professional_fee,
      tax_amount=p_tax_amount,total_before_credit=v_total,total_customer_payable=v_total,
      scope_of_work=trim(p_scope_of_work),inclusions=coalesce(p_inclusions,'[]'::jsonb),
      exclusions=coalesce(p_exclusions,'[]'::jsonb),cancellation_rule=nullif(trim(p_cancellation_rule),''),
      refund_rule=nullif(trim(p_refund_rule),''),valid_until=p_valid_until,updated_at=now()
    where id=v_quote_id;
  end if;
  return jsonb_build_object('ok',true,'quote_id',v_quote_id,'quote_number',v_number,'status','DRAFT');
end;
$$;

create or replace function public.ils_admin_send_matter_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid:=auth.uid(); v_quote public.ils_matter_quotes%rowtype;
begin
  if v_user is null or not coalesce(public.ils_is_admin(),false) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into v_quote from public.ils_matter_quotes where id=p_quote_id for update;
  if not found or v_quote.quote_status<>'DRAFT' then raise exception 'DRAFT_QUOTE_NOT_FOUND'; end if;
  if v_quote.valid_until<=now() then raise exception 'QUOTE_EXPIRED'; end if;
  update public.ils_matter_quotes set quote_status='SENT',sent_by=v_user,sent_at=now(),updated_at=now()
  where id=p_quote_id;
  return jsonb_build_object('ok',true,'quote_id',p_quote_id,'status','SENT');
end;
$$;

create or replace function public.ils_customer_matter_quotes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid:=auth.uid(); v_profile public.customer_profiles%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.customer_profiles where user_id=v_user and status='active' limit 1;
  if not found then raise exception 'ACTIVE_CUSTOMER_PROFILE_REQUIRED' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'client_requirement_id',q.client_requirement_id,
      'government_fee',q.government_fee,'ils_fee',q.ils_fee,'professional_fee',q.professional_fee,
      'tax_amount',q.tax_amount,'total_before_credit',q.total_before_credit,
      'enquiry_credit_amount',q.enquiry_credit_amount,'total_customer_payable',q.total_customer_payable,
      'currency',q.currency,'scope_of_work',q.scope_of_work,'inclusions',q.inclusions,
      'exclusions',q.exclusions,'cancellation_rule',q.cancellation_rule,'refund_rule',q.refund_rule,
      'valid_until',q.valid_until,'quote_status',q.quote_status,'final_order_id',q.final_order_id,
      'final_order_status',(select fo.status from public.orders fo where fo.id=q.final_order_id),
      'created_at',q.created_at,'sent_at',q.sent_at,'accepted_at',q.accepted_at
    ) order by q.created_at desc)
    from public.ils_matter_quotes q
    join public.service_requests sr on sr.id=q.source_service_request_id
    where q.user_id=v_user and sr.user_id=v_user
      and sr.client_requirement_id=q.client_requirement_id
      and q.quote_status in ('SENT','ACCEPTED','DECLINED','EXPIRED')
  ),'[]'::jsonb);
end;
$$;

create or replace function public.ils_customer_accept_matter_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_quote public.ils_matter_quotes%rowtype;
  v_source public.service_requests%rowtype;
  v_enquiry_order public.orders%rowtype;
  v_credit numeric(12,2):=0;
  v_enquiry_credit_available numeric(12,2):=0;
  v_final_due numeric(12,2);
  v_final_request uuid;
  v_final_order uuid;
  v_order_number text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_quote from public.ils_matter_quotes where id=p_quote_id and user_id=v_user for update;
  if not found then raise exception 'QUOTE_NOT_FOUND' using errcode='42501'; end if;
  if v_quote.quote_status='ACCEPTED' and v_quote.final_order_id is not null then
    return jsonb_build_object('ok',true,'quote_id',v_quote.id,'order_id',v_quote.final_order_id,
      'order_number',(select order_number from public.orders where id=v_quote.final_order_id),
      'amount',(select total from public.orders where id=v_quote.final_order_id),
      'credit_applied',v_quote.enquiry_credit_amount,
      'payment_required',coalesce((select status='pending' from public.orders where id=v_quote.final_order_id),false),
      'status','ACCEPTED');
  end if;
  if v_quote.quote_status<>'SENT' then raise exception 'QUOTE_NOT_ACCEPTABLE'; end if;
  if v_quote.valid_until<=now() then
    update public.ils_matter_quotes set quote_status='EXPIRED',updated_at=now() where id=v_quote.id;
    return jsonb_build_object('ok',false,'quote_id',v_quote.id,'status','EXPIRED','message','QUOTE_EXPIRED');
  end if;
  select * into v_source from public.service_requests
   where id=v_quote.source_service_request_id and user_id=v_user
     and client_requirement_id=v_quote.client_requirement_id for update;
  if not found then raise exception 'QUOTE_MATTER_OWNERSHIP_MISMATCH' using errcode='42501'; end if;

  -- The initial ₹299 enquiry order may belong to an earlier request under
  -- the same CRM matter. Resolve credit by authenticated customer + CRM matter,
  -- not only by the particular service request selected for this quotation.
  select o.* into v_enquiry_order
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  join public.services s on s.id=oi.service_id
  join public.service_requests paid_request on paid_request.id=o.service_request_id
  where paid_request.client_requirement_id=v_quote.client_requirement_id
    and paid_request.user_id=v_user
    and o.user_id=v_user
    and o.status='paid' and s.slug='ils-enquiry-fee-199'
    -- A paid enquiry order may be credited only once across all quotations.
    and not exists (
      select 1 from public.ils_matter_quote_credit_ledger used_credit
      where used_credit.enquiry_order_id=o.id
    )
  order by o.created_at desc limit 1;
  if found and v_quote.ils_fee>0 then
    -- Credit only the paid line amount for the enquiry SKU, never unrelated
    -- items that may share the same order.
    select coalesce(sum(oi.line_total),0) into v_enquiry_credit_available
    from public.order_items oi
    join public.services enquiry_service on enquiry_service.id=oi.service_id
    where oi.order_id=v_enquiry_order.id and enquiry_service.slug='ils-enquiry-fee-199';
    v_credit:=least(v_enquiry_credit_available,v_quote.ils_fee);
    if v_credit>0 then
      insert into public.ils_matter_quote_credit_ledger(enquiry_order_id,quote_id,client_requirement_id,amount)
      values(v_enquiry_order.id,v_quote.id,v_quote.client_requirement_id,v_credit);
    end if;
  end if;
  v_final_due:=greatest(0,v_quote.total_before_credit-v_credit);
  v_order_number:='ILS-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.service_requests(user_id,service_id,details,status,client_requirement_id)
  values(v_user,v_source.service_id,jsonb_build_object(
    'intake_source','ils-accepted-service-quote','quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,'client_requirement_id',v_quote.client_requirement_id
  ),case when v_final_due=0 then 'paid' else 'pending' end,v_quote.client_requirement_id)
  returning id into v_final_request;

  insert into public.orders(user_id,service_request_id,order_number,total,currency,status)
  values(v_user,v_final_request,v_order_number,v_final_due,'INR',case when v_final_due=0 then 'paid' else 'pending' end)
  returning id into v_final_order;

  insert into public.order_items(order_id,service_id,service_price_id,quantity,unit_price,line_total)
  values(v_final_order,v_source.service_id,null,1,v_final_due,v_final_due);

  if v_final_due=0 then
    insert into public.entitlements(user_id,service_id,order_id,status,starts_at)
    values(v_user,v_source.service_id,v_final_order,'active',now())
    on conflict (user_id,service_id,order_id) where order_id is not null do nothing;
  end if;

  update public.ils_matter_quotes set quote_status='ACCEPTED',
    enquiry_order_id=case when v_credit>0 then v_enquiry_order.id else null end,
    enquiry_credit_amount=v_credit,total_customer_payable=v_final_due,
    final_service_request_id=v_final_request,final_order_id=v_final_order,
    accepted_by=v_user,accepted_at=now(),updated_at=now()
  where id=v_quote.id;

  return jsonb_build_object('ok',true,'quote_id',v_quote.id,'quote_number',v_quote.quote_number,
    'order_id',v_final_order,'order_number',v_order_number,'amount',v_final_due,
    'credit_applied',v_credit,'status','ACCEPTED','payment_required',v_final_due>0);
end;
$$;

create or replace function public.ils_customer_decline_matter_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid:=auth.uid(); v_quote public.ils_matter_quotes%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_quote from public.ils_matter_quotes where id=p_quote_id and user_id=v_user for update;
  if not found then raise exception 'QUOTE_NOT_FOUND' using errcode='42501'; end if;
  if v_quote.quote_status<>'SENT' then raise exception 'QUOTE_NOT_DECLINABLE'; end if;
  update public.ils_matter_quotes set quote_status='DECLINED',declined_by=v_user,declined_at=now(),updated_at=now()
  where id=p_quote_id;
  return jsonb_build_object('ok',true,'quote_id',p_quote_id,'status','DECLINED');
end;
$$;

revoke all on function public.ils_admin_list_matter_quotes(integer) from public, anon;
revoke all on function public.ils_admin_save_matter_quote(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,jsonb,timestamptz,text,text) from public, anon;
revoke all on function public.ils_admin_send_matter_quote(uuid) from public, anon;
revoke all on function public.ils_customer_matter_quotes() from public, anon;
revoke all on function public.ils_customer_accept_matter_quote(uuid) from public, anon;
revoke all on function public.ils_customer_decline_matter_quote(uuid) from public, anon;
grant execute on function public.ils_admin_list_matter_quotes(integer) to authenticated;
grant execute on function public.ils_admin_save_matter_quote(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,jsonb,timestamptz,text,text) to authenticated;
grant execute on function public.ils_admin_send_matter_quote(uuid) to authenticated;
grant execute on function public.ils_customer_matter_quotes() to authenticated;
grant execute on function public.ils_customer_accept_matter_quote(uuid) to authenticated;
grant execute on function public.ils_customer_decline_matter_quote(uuid) to authenticated;

comment on table public.ils_matter_quotes is
'Admin-issued, customer-accepted ILS Service Mart quotations. Separate from legacy complaint-passport quotes.';
comment on table public.ils_matter_quote_credit_ledger is
'Immutable one-time ledger applying a verified paid initial enquiry order as credit against the same matter ILS fee.';
