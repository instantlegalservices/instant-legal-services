-- UPI proof hardening. Apply only after isolated TEST E2E validation.
-- Customer writes remain through SECURITY DEFINER RPC; direct table INSERT is closed.
BEGIN;

REVOKE INSERT ON TABLE public.payment_proofs FROM authenticated, PUBLIC;
DO $columns$
DECLARE c text;
BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name='payment_proofs'
  LOOP
    EXECUTE format('REVOKE INSERT (%I) ON TABLE public.payment_proofs FROM authenticated, PUBLIC', c);
  END LOOP;
END
$columns$;
DROP POLICY IF EXISTS payment_proofs_insert_own ON public.payment_proofs;

-- Canonical UTRs are stored uppercase/alphanumeric by the submission RPC.
-- This index protects active proofs against duplicate references.
CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_active_utr_uidx
ON public.payment_proofs (transaction_ref)
WHERE status IN ('pending','verified');

CREATE OR REPLACE FUNCTION public.ils_submit_upi_payment_proof(
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_path text := regexp_replace(coalesce(p_screenshot_path,''), '^/+', '');
  v_ref text := upper(regexp_replace(coalesce(p_transaction_ref,''), '[^A-Za-z0-9]', '', 'g'));
  v_upi text := lower(trim(coalesce(p_upi_id,'')));
  v_expected_upi constant text := '8445609837@axl';
  v_proof_id uuid;
  v_object_size bigint;
  v_object_mime text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id=p_order_id AND user_id=v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  IF p_amount IS NULL OR abs(p_amount-v_order.total) > 0.01 THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH';
  END IF;
  IF v_upi <> v_expected_upi THEN RAISE EXCEPTION 'UPI_ID_MISMATCH'; END IF;
  IF length(v_ref) < 8 OR length(v_ref) > 40 THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_REFERENCE';
  END IF;
  IF v_path !~ ('^' || v_user::text || '/' || p_order_id::text || '/[^/]+$') THEN
    RAISE EXCEPTION 'INVALID_PROOF_PATH';
  END IF;
  IF lower(coalesce(p_mime_type,'')) NOT IN ('image/jpeg','image/png','image/webp') THEN
    RAISE EXCEPTION 'INVALID_PROOF_TYPE';
  END IF;
  IF coalesce(p_file_size_bytes,0) <= 0 OR p_file_size_bytes > 5242880 THEN
    RAISE EXCEPTION 'INVALID_PROOF_SIZE';
  END IF;
  IF coalesce(p_screenshot_sha256,'') !~ '^[a-fA-F0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_PROOF_HASH';
  END IF;
  IF nullif(trim(p_payee_name_claimed),'') IS NULL OR char_length(p_payee_name_claimed)>120 THEN
    RAISE EXCEPTION 'INVALID_PAYEE_NAME';
  END IF;

  -- Verify the exact private Storage object; client-provided metadata is not trusted.
  SELECT CASE WHEN o.metadata->>'size' ~ '^[0-9]+$'
              THEN (o.metadata->>'size')::bigint ELSE NULL END,
         lower(coalesce(o.metadata->>'mimetype',''))
    INTO v_object_size,v_object_mime
  FROM storage.objects o
  WHERE o.bucket_id='payment-proofs'
    AND o.name=v_path
    AND o.owner=v_user
    AND o.owner_id=v_user::text
    AND o.archived_at IS NULL
    AND coalesce(o.is_delete_marker,false)=false;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_PROOF_OBJECT_NOT_FOUND'; END IF;
  IF v_object_size IS NULL OR v_object_size<=0 OR v_object_size>5242880
     OR v_object_size<>p_file_size_bytes THEN
    RAISE EXCEPTION 'PAYMENT_PROOF_SIZE_MISMATCH';
  END IF;
  IF v_object_mime<>lower(p_mime_type) THEN
    RAISE EXCEPTION 'PAYMENT_PROOF_TYPE_MISMATCH';
  END IF;

  -- Serialize a canonical UTR across concurrent submissions, including rejected history.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ref,0));
  IF EXISTS (SELECT 1 FROM public.payment_proofs
             WHERE transaction_ref=v_ref AND order_id<>p_order_id) THEN
    RAISE EXCEPTION 'TRANSACTION_REFERENCE_ALREADY_USED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_proofs
             WHERE order_id=p_order_id AND status='pending') THEN
    RAISE EXCEPTION 'PROOF_ALREADY_PENDING';
  END IF;

  INSERT INTO public.payment_proofs(
    order_id,user_id,amount,currency,upi_id,transaction_ref,
    payee_name_claimed,screenshot_path,screenshot_sha256,mime_type,file_size_bytes
  ) VALUES (
    p_order_id,v_user,p_amount,v_order.currency,v_upi,v_ref,
    nullif(trim(p_payee_name_claimed),''),v_path,lower(p_screenshot_sha256),
    lower(p_mime_type),p_file_size_bytes
  ) RETURNING id INTO v_proof_id;

  RETURN jsonb_build_object(
    'ok',true,'proof_id',v_proof_id,'status','pending',
    'order_id',p_order_id,'order_number',v_order.order_number,
    'message','Payment proof submitted for verification. Access remains locked until the payment is verified.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ils_admin_verify_upi_payment_proof(
  p_proof_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_proof public.payment_proofs%rowtype;
  v_order public.orders%rowtype;
  v_request public.service_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_service_id uuid;
  v_service_count integer;
BEGIN
  IF v_user IS NULL OR NOT public.ils_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_proof_id IS NULL THEN RAISE EXCEPTION 'PROOF_ID_REQUIRED'; END IF;
  IF v_decision NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes)>2000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;

  SELECT * INTO v_proof FROM public.payment_proofs WHERE id=p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_NOT_FOUND'; END IF;
  IF v_proof.status<>'pending' THEN RAISE EXCEPTION 'PROOF_ALREADY_DECIDED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=v_proof.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_proof.user_id IS DISTINCT FROM v_order.user_id THEN
    RAISE EXCEPTION 'PROOF_ORDER_OWNER_MISMATCH';
  END IF;

  IF v_decision='rejected' THEN
    UPDATE public.payment_proofs
    SET status='rejected',verification_notes=nullif(trim(p_notes),''),
        verified_at=now(),verified_by=v_user
    WHERE id=p_proof_id;
    RETURN jsonb_build_object('ok',true,'proof_id',p_proof_id,
      'decision',v_decision,'order_id',v_proof.order_id);
  END IF;

  IF v_order.status<>'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  IF v_proof.amount IS NULL OR abs(v_proof.amount-v_order.total)>0.01 THEN
    RAISE EXCEPTION 'PROOF_ORDER_AMOUNT_MISMATCH';
  END IF;
  IF upper(v_proof.currency)<>upper(v_order.currency) THEN
    RAISE EXCEPTION 'PROOF_ORDER_CURRENCY_MISMATCH';
  END IF;
  IF v_order.service_request_id IS NULL THEN RAISE EXCEPTION 'SERVICE_REQUEST_REQUIRED'; END IF;

  SELECT * INTO v_request
  FROM public.service_requests
  WHERE id=v_order.service_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_REQUEST_NOT_FOUND'; END IF;
  IF v_request.user_id IS DISTINCT FROM v_order.user_id THEN
    RAISE EXCEPTION 'SERVICE_REQUEST_OWNER_MISMATCH';
  END IF;
  IF v_request.status<>'pending' THEN RAISE EXCEPTION 'SERVICE_REQUEST_NOT_PENDING'; END IF;

  SELECT count(DISTINCT service_id),min(service_id::text)::uuid
    INTO v_service_count,v_service_id
  FROM public.order_items
  WHERE order_id=v_order.id AND service_id IS NOT NULL;
  IF v_service_count<>1 OR v_service_id IS NULL
     OR v_service_id IS DISTINCT FROM v_request.service_id THEN
    RAISE EXCEPTION 'ORDER_SERVICE_MAPPING_INVALID';
  END IF;

  UPDATE public.payment_proofs
  SET status='verified',verification_notes=nullif(trim(p_notes),''),
      verified_at=now(),verified_by=v_user
  WHERE id=p_proof_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_ALREADY_DECIDED'; END IF;

  UPDATE public.orders SET status='paid' WHERE id=v_order.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;

  UPDATE public.service_requests
  SET status='paid' WHERE id=v_request.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_REQUEST_NOT_PENDING'; END IF;

  -- Order row lock serializes admin decisions for this order; avoid duplicate grants.
  IF NOT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id=v_order.user_id AND e.service_id=v_service_id AND e.order_id=v_order.id
  ) THEN
    INSERT INTO public.entitlements(user_id,service_id,order_id,status,starts_at)
    VALUES(v_order.user_id,v_service_id,v_order.id,'active',now());
  END IF;

  RETURN jsonb_build_object('ok',true,'proof_id',p_proof_id,
    'decision',v_decision,'order_id',v_order.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.ils_admin_verify_upi_payment_proof(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ils_admin_verify_upi_payment_proof(uuid,text,text) TO authenticated,service_role;

COMMIT;
