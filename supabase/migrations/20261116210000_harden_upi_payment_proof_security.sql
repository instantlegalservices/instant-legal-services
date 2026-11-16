-- Harden Production UPI proof submission and verification.
-- Requires a fresh pre-deployment preflight; see docs/security/production-upi-payment-proof-hardening-proposal.md.
-- Never apply to TEST via dashboard SQL editor or to Production without the release gate and explicit approval.

do $preflight$
begin
  if exists (
    select 1
    from public.payment_proofs
    where status in ('pending','verified')
    group by upper(regexp_replace(transaction_ref,'[^A-Za-z0-9]','','g'))
    having count(*) > 1
  ) then
    raise exception 'UPI_ACTIVE_UTR_NORMALIZED_DUPLICATES_EXIST';
  end if;

  if exists (
    select 1
    from public.entitlements
    where order_id is not null
    group by user_id,service_id,order_id
    having count(*) > 1
  ) then
    raise exception 'ENTITLEMENT_ORDER_DUPLICATES_EXIST';
  end if;
end;
$preflight$;

-- Customer proof submissions must pass through the validating SECURITY DEFINER RPC.
drop policy if exists payment_proofs_insert_own on public.payment_proofs;
revoke all on table public.payment_proofs from anon,authenticated;
grant select on table public.payment_proofs to authenticated;

-- One active proof per canonical UTR, including values with punctuation differences.
create unique index if not exists payment_proofs_active_transaction_ref_normalized_uidx
  on public.payment_proofs (
    upper(regexp_replace(transaction_ref,'[^A-Za-z0-9]','','g'))
  )
  where status in ('pending','verified');

-- One entitlement per service/order pair. NULL order_id legacy rows remain unaffected.
create unique index if not exists entitlements_user_service_order_uidx
  on public.entitlements(user_id,service_id,order_id)
  where order_id is not null;

create or replace function public.ils_submit_upi_payment_proof(
  p_order_id uuid,
  p_amount numeric,
  p_upi_id text,
  p_transaction_ref text,
  p_payee_name_claimed text,
  p_screenshot_path text,
  p_screenshot_sha256 text,
  p_mime_type text,
  p_file_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_path text := regexp_replace(coalesce(p_screenshot_path,''), '^/+', '');
  v_ref text := upper(regexp_replace(coalesce(p_transaction_ref,''), '[^A-Za-z0-9]', '', 'g'));
  v_upi text := lower(trim(coalesce(p_upi_id,'')));
  v_expected_upi constant text := '8445609837@axl';
  v_proof_id uuid;
  v_object_size bigint;
  v_object_mime text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order
  from public.orders
  where id=p_order_id and user_id=v_user
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ORDER_NOT_PENDING'; end if;

  if p_amount is null or abs(p_amount-v_order.total) > 0.01 then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  if v_upi <> v_expected_upi then raise exception 'UPI_ID_MISMATCH'; end if;
  if length(v_ref) < 8 or length(v_ref) > 40 then
    raise exception 'INVALID_TRANSACTION_REFERENCE';
  end if;
  if v_path !~ ('^' || v_user::text || '/' || p_order_id::text || '/[^/]+$') then
    raise exception 'INVALID_PROOF_PATH';
  end if;
  if lower(coalesce(p_mime_type,'')) not in ('image/jpeg','image/png','image/webp') then
    raise exception 'INVALID_PROOF_TYPE';
  end if;
  if coalesce(p_file_size_bytes,0) <= 0 or p_file_size_bytes > 5242880 then
    raise exception 'INVALID_PROOF_SIZE';
  end if;
  if coalesce(p_screenshot_sha256,'') !~ '^[a-fA-F0-9]{64}$' then
    raise exception 'INVALID_PROOF_HASH';
  end if;

  -- Verify the exact private Storage object and both Production ownership columns.
  select nullif(o.metadata->>'size','')::bigint,
         lower(coalesce(o.metadata->>'mimetype',''))
    into v_object_size,v_object_mime
  from storage.objects o
  where o.bucket_id='payment-proofs'
    and o.name=v_path
    and o.owner=v_user
    and o.owner_id=v_user::text;
  if not found then raise exception 'PAYMENT_PROOF_OBJECT_NOT_FOUND'; end if;
  if v_object_size is null or v_object_size<=0
     or v_object_size>5242880 or v_object_size<>p_file_size_bytes then
    raise exception 'PAYMENT_PROOF_SIZE_MISMATCH';
  end if;
  if v_object_mime<>lower(p_mime_type) then
    raise exception 'PAYMENT_PROOF_TYPE_MISMATCH';
  end if;

  -- Serialize canonical UTR reuse checks across different orders.
  perform pg_advisory_xact_lock(hashtextextended('ils:upi-utr:'||v_ref,0));
  if exists (
    select 1 from public.payment_proofs pp
    where upper(regexp_replace(pp.transaction_ref,'[^A-Za-z0-9]','','g'))=v_ref
      and pp.order_id<>p_order_id
  ) then
    raise exception 'TRANSACTION_REFERENCE_ALREADY_USED';
  end if;

  if exists (
    select 1 from public.payment_proofs
    where order_id=p_order_id and status='pending'
  ) then
    raise exception 'PROOF_ALREADY_PENDING';
  end if;

  insert into public.payment_proofs(
    order_id,user_id,amount,currency,upi_id,transaction_ref,
    payee_name_claimed,screenshot_path,screenshot_sha256,mime_type,file_size_bytes
  ) values (
    p_order_id,v_user,p_amount,v_order.currency,v_upi,v_ref,
    nullif(trim(p_payee_name_claimed),''),v_path,lower(p_screenshot_sha256),
    lower(p_mime_type),p_file_size_bytes
  ) returning id into v_proof_id;

  return jsonb_build_object(
    'ok',true,'proof_id',v_proof_id,'status','pending',
    'order_id',p_order_id,'order_number',v_order.order_number,
    'message','Payment proof submitted for verification. Access remains locked until the payment is verified.'
  );
end;
$function$;

create or replace function public.ils_admin_verify_upi_payment_proof(
  p_proof_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_proof public.payment_proofs%rowtype;
  v_order public.orders%rowtype;
  v_request public.service_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_service_ids uuid[];
  v_item_count integer;
  v_service_id uuid;
begin
  if v_user is null or not public.ils_is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_proof_id is null then raise exception 'PROOF_ID_REQUIRED'; end if;
  if v_decision not in ('verified','rejected') then raise exception 'INVALID_DECISION'; end if;
  if p_notes is not null and char_length(p_notes)>2000 then raise exception 'INVALID_NOTES'; end if;

  select * into v_proof
  from public.payment_proofs
  where id=p_proof_id
  for update;
  if not found then raise exception 'PROOF_NOT_FOUND'; end if;
  if v_proof.status<>'pending' then raise exception 'PROOF_ALREADY_DECIDED'; end if;

  if v_decision='verified' then
    -- Lock order before request. This serializes all proofs for one order.
    select * into v_order
    from public.orders
    where id=v_proof.order_id
    for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_order.user_id is distinct from v_proof.user_id then
      raise exception 'PROOF_ORDER_OWNER_MISMATCH';
    end if;
    if v_order.status<>'pending' then raise exception 'ORDER_NOT_PENDING'; end if;
    if v_order.total is null or abs(v_order.total-v_proof.amount)>0.01 then
      raise exception 'PAYMENT_AMOUNT_MISMATCH';
    end if;
    if v_order.currency is distinct from v_proof.currency then
      raise exception 'PAYMENT_CURRENCY_MISMATCH';
    end if;
    if v_order.service_request_id is null then
      raise exception 'SERVICE_REQUEST_REQUIRED';
    end if;

    select * into v_request
    from public.service_requests
    where id=v_order.service_request_id
      and user_id=v_order.user_id
    for update;
    if not found then raise exception 'SERVICE_REQUEST_OWNER_MISMATCH'; end if;
    if v_request.status<>'pending' then raise exception 'SERVICE_REQUEST_NOT_PENDING'; end if;

    select count(*),array_agg(oi.service_id order by oi.created_at,oi.id)
      into v_item_count,v_service_ids
    from public.order_items oi
    where oi.order_id=v_order.id;
    if v_item_count<>1 or v_service_ids is null or cardinality(v_service_ids)<>1 then
      raise exception 'INVALID_ORDER_SERVICE_MAPPING';
    end if;
    v_service_id:=v_service_ids[1];
    if v_service_id is distinct from v_request.service_id then
      raise exception 'ORDER_SERVICE_REQUEST_MISMATCH';
    end if;

    update public.payment_proofs
    set status='verified',
        verification_notes=nullif(trim(p_notes),''),
        verified_at=now(),
        verified_by=v_user
    where id=p_proof_id and status='pending';
    if not found then raise exception 'PROOF_ALREADY_DECIDED'; end if;

    update public.orders set status='paid'
    where id=v_order.id and status='pending';
    if not found then raise exception 'ORDER_NOT_PENDING'; end if;

    update public.service_requests set status='paid'
    where id=v_request.id and status='pending';
    if not found then raise exception 'SERVICE_REQUEST_NOT_PENDING'; end if;

    insert into public.entitlements(user_id,service_id,order_id,status,starts_at)
    values(v_order.user_id,v_service_id,v_order.id,'active',now())
    on conflict (user_id,service_id,order_id) where order_id is not null do nothing;
  else
    update public.payment_proofs
    set status='rejected',
        verification_notes=nullif(trim(p_notes),''),
        verified_at=now(),
        verified_by=v_user
    where id=p_proof_id and status='pending';
    if not found then raise exception 'PROOF_ALREADY_DECIDED'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,'proof_id',p_proof_id,'decision',v_decision,
    'order_id',v_proof.order_id
  );
end;
$function$;

revoke all on function public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer) from public,anon;
grant execute on function public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer) to authenticated,service_role;
revoke all on function public.ils_admin_verify_upi_payment_proof(uuid,text,text) from public,anon;
grant execute on function public.ils_admin_verify_upi_payment_proof(uuid,text,text) to authenticated,service_role;
