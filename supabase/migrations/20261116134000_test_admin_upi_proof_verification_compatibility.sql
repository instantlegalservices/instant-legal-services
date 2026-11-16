-- TEST compatibility: admin UI requires the payment-proof list and decision RPCs.
-- Mirrors Production authorization and review semantics while respecting the TEST schema,
-- which does not currently include the Production entitlements table.

create or replace function public.ils_admin_upi_payment_proofs(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,100),250));
begin
  if v_user is null or not public.ils_is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return coalesce((
    select jsonb_agg(x order by x.submitted_at desc)
    from (
      select pp.id, pp.order_id, pp.user_id, pp.amount, pp.currency,
             pp.upi_id, pp.transaction_ref, pp.payee_name_claimed,
             pp.screenshot_path, pp.screenshot_sha256, pp.mime_type,
             pp.file_size_bytes, pp.status, pp.verification_notes,
             pp.submitted_at, pp.verified_at, pp.verified_by,
             o.order_number, o.status as order_status,
             s.slug as service_slug, s.name as service_name
      from public.payment_proofs pp
      join public.orders o on o.id=pp.order_id
      left join public.services s on s.id=(
        select oi.service_id from public.order_items oi
        where oi.order_id=o.id order by oi.created_at limit 1
      )
      order by pp.submitted_at desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.ils_admin_verify_upi_payment_proof(
  p_proof_id uuid, p_decision text, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_proof public.payment_proofs%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_request_id uuid;
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
  if v_proof.status <> 'pending' then raise exception 'PROOF_ALREADY_DECIDED'; end if;

  if v_decision='verified' then
    select o.service_request_id into v_request_id
    from public.orders o
    join public.service_requests sr
      on sr.id=o.service_request_id and sr.user_id=o.user_id
    where o.id=v_proof.order_id
      and o.user_id=v_proof.user_id
      and o.status='pending'
      and o.currency=v_proof.currency
      and abs(o.total-v_proof.amount)<=0.01
      and sr.status='pending'
    for update of o,sr;
    if not found then raise exception 'ORDER_OR_REQUEST_NOT_PAYABLE'; end if;

    update public.payment_proofs
    set status='verified',
        verification_notes=nullif(trim(p_notes),''),
        verified_at=now(), verified_by=v_user
    where id=p_proof_id;

    update public.orders set status='paid'
    where id=v_proof.order_id and status='pending';
    if not found then raise exception 'ORDER_NOT_PENDING'; end if;

    update public.service_requests set status='paid'
    where id=v_request_id and status='pending';
    if not found then raise exception 'SERVICE_REQUEST_NOT_PENDING'; end if;
  else
    update public.payment_proofs
    set status='rejected',
        verification_notes=nullif(trim(p_notes),''),
        verified_at=now(), verified_by=v_user
    where id=p_proof_id;
  end if;

  return jsonb_build_object(
    'ok',true,'proof_id',p_proof_id,'decision',v_decision,
    'order_id',v_proof.order_id
  );
end;
$function$;

revoke all on function public.ils_admin_upi_payment_proofs(integer) from public, anon;
grant execute on function public.ils_admin_upi_payment_proofs(integer) to authenticated, service_role;
revoke all on function public.ils_admin_verify_upi_payment_proof(uuid,text,text) from public, anon;
grant execute on function public.ils_admin_verify_upi_payment_proof(uuid,text,text) to authenticated, service_role;
