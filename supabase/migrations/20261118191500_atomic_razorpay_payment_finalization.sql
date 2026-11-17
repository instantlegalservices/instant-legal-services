-- Atomic, idempotent Razorpay settlement shared by verify endpoint and webhook.
-- Edge handlers must independently validate gateway signature/payment status before invoking.
BEGIN;

CREATE OR REPLACE FUNCTION public.ils_reserve_razorpay_attempt(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'ORDER_ID_REQUIRED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status<>'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;

  IF EXISTS (SELECT 1 FROM public.payment_proofs pp
             WHERE pp.order_id=v_order.id AND pp.status='pending') THEN
    RAISE EXCEPTION 'UPI_PROOF_PENDING';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id=v_order.id AND gateway='razorpay' AND status='created'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'payment_id',v_payment.id,
      'gateway_order_id',v_payment.gateway_order_id,'amount',v_order.total,
      'currency',v_order.currency,'order_number',v_order.order_number);
  END IF;

  INSERT INTO public.payments(order_id,gateway,amount,currency,status)
  VALUES(v_order.id,'razorpay',v_order.total,v_order.currency,'created')
  RETURNING * INTO v_payment;
  RETURN jsonb_build_object('ok',true,'payment_id',v_payment.id,
    'gateway_order_id',NULL,'amount',v_order.total,
    'currency',v_order.currency,'order_number',v_order.order_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ils_attach_razorpay_order(
  p_payment_id uuid,
  p_gateway_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL OR nullif(trim(p_gateway_order_id),'') IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_IDENTIFIERS_REQUIRED';
  END IF;
  SELECT * INTO v_payment FROM public.payments
  WHERE id=p_payment_id AND gateway='razorpay' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RAZORPAY_PAYMENT_NOT_FOUND'; END IF;
  IF v_payment.status<>'created' THEN RAISE EXCEPTION 'PAYMENT_NOT_ATTACHABLE'; END IF;
  IF v_payment.gateway_order_id IS NOT NULL
     AND v_payment.gateway_order_id<>p_gateway_order_id THEN
    RAISE EXCEPTION 'GATEWAY_ORDER_ALREADY_ATTACHED';
  END IF;
  UPDATE public.payments SET gateway_order_id=p_gateway_order_id
  WHERE id=v_payment.id;
  RETURN jsonb_build_object('ok',true,'payment_id',v_payment.id,
    'gateway_order_id',p_gateway_order_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_reserve_razorpay_attempt(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_reserve_razorpay_attempt(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ils_attach_razorpay_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_attach_razorpay_order(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.ils_finalize_razorpay_payment(
  p_payment_id uuid,
  p_gateway_payment_id text,
  p_gateway_amount_minor bigint,
  p_gateway_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_request public.service_requests%rowtype;
  v_service_id uuid;
BEGIN
  IF p_payment_id IS NULL OR nullif(trim(p_gateway_payment_id),'') IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_IDENTIFIERS_REQUIRED';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id=p_payment_id AND gateway='razorpay'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RAZORPAY_PAYMENT_NOT_FOUND'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id=v_payment.order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  IF v_payment.amount IS DISTINCT FROM v_order.total
     OR upper(v_payment.currency) IS DISTINCT FROM upper(v_order.currency) THEN
    RAISE EXCEPTION 'PAYMENT_ORDER_AMOUNT_CURRENCY_MISMATCH';
  END IF;
  IF p_gateway_amount_minor IS NULL OR p_gateway_amount_minor<>round(v_payment.amount*100)::bigint
     OR upper(coalesce(p_gateway_currency,''))<>upper(v_payment.currency) THEN
    RAISE EXCEPTION 'GATEWAY_AMOUNT_CURRENCY_MISMATCH';
  END IF;

  IF v_payment.status='paid' THEN
    IF v_payment.gateway_payment_id IS DISTINCT FROM p_gateway_payment_id
       OR v_order.status<>'paid' THEN
      RAISE EXCEPTION 'PAYMENT_ALREADY_SETTLED_DIFFERENTLY';
    END IF;
    RETURN jsonb_build_object('ok',true,'already_finalized',true,
      'payment_id',v_payment.id,'order_id',v_order.id);
  END IF;

  IF v_payment.status NOT IN ('created','pending') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_SETTLEABLE';
  END IF;
  IF v_order.status<>'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  IF v_payment.gateway_payment_id IS NOT NULL
     AND v_payment.gateway_payment_id<>p_gateway_payment_id THEN
    RAISE EXCEPTION 'PAYMENT_ID_MISMATCH';
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
  IF v_request.status NOT IN ('pending','paid') THEN
    RAISE EXCEPTION 'SERVICE_REQUEST_NOT_SETTLEABLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id=v_order.id AND oi.service_id=v_request.service_id
  ) THEN RAISE EXCEPTION 'ORDER_SERVICE_MAPPING_MISMATCH'; END IF;

  v_service_id := v_request.service_id;

  UPDATE public.payments
  SET gateway_payment_id=p_gateway_payment_id,status='paid',paid_at=coalesce(paid_at,now())
  WHERE id=v_payment.id;
  UPDATE public.orders SET status='paid' WHERE id=v_order.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  UPDATE public.service_requests SET status='paid'
  WHERE id=v_request.id AND status IN ('pending','paid');
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_REQUEST_UPDATE_FAILED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id=v_order.user_id AND e.service_id=v_service_id AND e.order_id=v_order.id
  ) THEN
    INSERT INTO public.entitlements(user_id,service_id,order_id,status,starts_at)
    VALUES(v_order.user_id,v_service_id,v_order.id,'active',now());
  END IF;

  RETURN jsonb_build_object('ok',true,'already_finalized',false,
    'payment_id',v_payment.id,'order_id',v_order.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_finalize_razorpay_payment(uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_finalize_razorpay_payment(uuid,text) TO service_role;

-- Prevent two concurrently-created active Razorpay attempts for one order.
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_gateway_order_id_uidx
ON public.payments(gateway_order_id)
WHERE gateway='razorpay' AND gateway_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_razorpay_created_per_order_uidx
ON public.payments(order_id)
WHERE gateway='razorpay' AND status='created';

COMMIT;
