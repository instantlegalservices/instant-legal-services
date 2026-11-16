-- TEST-only: bind each submitted payment proof to an existing private
-- Storage object owned by the authenticated customer, and verify actual
-- Storage metadata rather than trusting client-supplied MIME/size values.
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
set search_path = public, pg_temp
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

  select nullif(o.metadata->>'size','')::bigint,
         lower(coalesce(o.metadata->>'mimetype',''))
    into v_object_size,v_object_mime
  from storage.objects o
  where o.bucket_id='payment-proofs'
    and o.name=v_path
    and o.owner_id=v_user::text;

  if not found then raise exception 'PAYMENT_PROOF_OBJECT_NOT_FOUND'; end if;
  if v_object_size is null or v_object_size <= 0
     or v_object_size > 5242880
     or v_object_size <> p_file_size_bytes then
    raise exception 'PAYMENT_PROOF_SIZE_MISMATCH';
  end if;
  if v_object_mime <> lower(p_mime_type) then
    raise exception 'PAYMENT_PROOF_TYPE_MISMATCH';
  end if;

  -- A rejected UTR may be corrected and resubmitted for the same order,
  -- but it must never be replayed against a different order.
  if exists (select 1 from public.payment_proofs
             where transaction_ref=v_ref and order_id<>p_order_id) then
    raise exception 'TRANSACTION_REFERENCE_ALREADY_USED';
  end if;

  if exists (select 1 from public.payment_proofs
             where order_id=p_order_id and status='pending') then
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
