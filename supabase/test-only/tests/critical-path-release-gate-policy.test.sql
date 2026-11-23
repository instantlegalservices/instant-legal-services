-- Disposable PostgreSQL CI only. Never run against Supabase TEST or Production.
BEGIN;

DO $test$
DECLARE
  v_hostile_def text;
  v_summary_def text;
  v_release_def text;
  v_has_assertion_column boolean;
  v_summary record;
  v_hostile record;
  v_gate_id uuid;
  v_gate_decision text;
  v_payment_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_evidence_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_submission_id uuid := gen_random_uuid();
  v_verifier_id uuid := gen_random_uuid();
  v_summary_after_payment record;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='ils_critical_path_release_proof_hostile_results'
      AND column_name='assertion_verified'
      AND is_nullable='NO'
  ) INTO v_has_assertion_column;
  IF NOT v_has_assertion_column THEN
    RAISE EXCEPTION 'Missing NOT NULL assertion_verified column';
  END IF;

  SELECT pg_get_functiondef('public.ils_run_critical_path_release_proof_hostile_matrix()'::regprocedure)
    INTO v_hostile_def;
  IF position('INSERT INTO public.ils_critical_path_release_proof_hostile_results' in upper(v_hostile_def))>0
     OR position('DELETE FROM public.ils_critical_path_release_proof_hostile_results' in upper(v_hostile_def))>0
     OR position('HOLD' in v_hostile_def)=0 THEN
    RAISE EXCEPTION 'Legacy hostile runner must not manufacture or delete results and must fail closed';
  END IF;

  SELECT pg_get_functiondef('public.ils_release_critical_path_summary()'::regprocedure)
    INTO v_summary_def;
  IF position('ils_e2e_function_deployment_registry' in v_summary_def)=0
     OR position('d.active' in v_summary_def)=0
     OR position('NOTIFICATION_E2E' in v_summary_def)=0
     OR position('PAYMENT_E2E' in v_summary_def)=0
     OR position('GOV_ROUTE_E2E' in v_summary_def)=0 THEN
    RAISE EXCEPTION 'Canonical summary lacks active deployment or path-specific proof requirements';
  END IF;

  SELECT pg_get_functiondef('public.ils_e2e_release_gate_evaluate()'::regprocedure)
    INTO v_release_def;
  IF position('ils_document_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_notification_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_professional_assignment_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_security_execution_e2e_release_gate_decisions' in v_release_def)=0
     OR position('assertion_verified' in v_release_def)=0
     OR position('ils_critical_path_evidence_binding_integrity_audit' in v_release_def)=0
     OR position('ils_critical_path_release_proof_runs' in v_release_def)=0
     OR position('v_hostile_total=8' in v_release_def)=0
     OR position('r.created_at >= greatest' in v_release_def)=0
     OR position('RUNTIME_ATTACK' in v_release_def)=0
     OR position('PREFLIGHT_BYPASS' in v_release_def)=0
     OR position('UNAUTHORIZED_EXECUTION' in v_release_def)=0
     OR position('REPLAY_NONCE' in v_release_def)=0
     OR position('SNAPSHOT_TAMPER' in v_release_def)=0
     OR position('EXPIRED_BINDING' in v_release_def)=0
     OR position('DESTRUCTIVE_ACTION' in v_release_def)=0
     OR position('g.hostile_tests_failed=0' in v_release_def)=0
     OR position('g.production_touch_detected IS FALSE' in v_release_def)=0 THEN
    RAISE EXCEPTION 'Overall release gate is missing a mandatory independent gate';
  END IF;

  -- Calling the summary is read-only; it must report all eight inventory paths.
  SELECT * INTO v_summary FROM public.ils_release_critical_path_summary();
  IF v_summary.total_paths<>8 THEN
    RAISE EXCEPTION 'Expected 8 critical paths, observed %',v_summary.total_paths;
  END IF;

  IF regexp_replace('www.example.gov','^www[.]','') <> 'example.gov'
     OR regexp_replace('example.gov','^www[.]','') <> 'example.gov' THEN
    RAISE EXCEPTION 'Official host normalization must handle www and bare host';
  END IF;

  -- Payment flags alone are insufficient: evidence must resolve to a paid
  -- persisted payment row and matching paid order.
  UPDATE public.ils_critical_path_evidence_contracts
  SET expected_provenance='REAL_EXTERNAL',
      expected_source_pattern='payment',
      expected_function_pattern='payment'
  WHERE critical_path_code='PAYMENT_E2E';

  IF public.ils_e2e_detail_uuid(
       '{"payment_id":"11111111-1111-4111-8111-111111111111"}',
       'payment_id'
     ) <> '11111111-1111-4111-8111-111111111111'::uuid
     OR public.ils_e2e_detail_uuid('{"payment_id":"bad"}','payment_id') IS NOT NULL
     OR public.ils_e2e_detail_uuid('{"payment_id":"11111111-1111-4111-8111-111111111111"}','unexpected') IS NOT NULL THEN
    RAISE EXCEPTION 'Payment evidence UUID extraction must be strict and null-safe';
  END IF;

  INSERT INTO public.ils_e2e_evidence(
    id,evidence_class,provenance_class,source_type,authenticated_user_id,
    invocation_correlation_id,function_slug,function_version,function_sha256,
    details,critical_path_code
  ) VALUES (
    v_evidence_id,'VERIFIED','REAL_EXTERNAL','payment',v_user_id,
    'ci-payment-gateway-correlation','payment-e2e',1,repeat('a',64),
    jsonb_build_object(
      'payment_id',v_payment_id,'order_id',v_order_id,
      'gateway_signature_verified',true,'provider_payment_verified',true,
      'payment_row_verified',true,'order_state_paid',true
    )::text,
    'PAYMENT_E2E'
  );
  INSERT INTO public.ils_critical_path_evidence_registry(id,evidence_id,critical_path_code,binding_status)
  VALUES(gen_random_uuid(),v_evidence_id,'PAYMENT_E2E','BOUND');
  INSERT INTO public.ils_e2e_function_deployment_registry(
    function_slug,function_version,deployment_sha256,critical_path_code,active
  ) VALUES('payment-e2e',1,repeat('a',64),'PAYMENT_E2E',true);

  SELECT * INTO v_summary_after_payment FROM public.ils_release_critical_path_summary();
  IF v_summary_after_payment.verified_paths<>0 THEN
    RAISE EXCEPTION 'Payment evidence flags without a persisted payment/order must not verify a path';
  END IF;

  INSERT INTO public.orders(id,total,currency,status)
  VALUES(v_order_id,100,'INR','paid');
  INSERT INTO public.payments(
    id,order_id,gateway,gateway_payment_id,amount,currency,status,paid_at
  ) VALUES(v_payment_id,v_order_id,'razorpay','pay_ci_123',100,'INR','paid',now());

  SELECT * INTO v_summary_after_payment FROM public.ils_release_critical_path_summary();
  IF v_summary_after_payment.verified_paths<>1 THEN
    RAISE EXCEPTION 'Matching persisted Razorpay payment and paid order should verify exactly one path; observed %',
      v_summary_after_payment.verified_paths;
  END IF;

  -- Verify the UPI branch against the actual submission, payment event,
  -- verifier event and paid order rather than trusting evidence flags.
  DELETE FROM public.ils_e2e_evidence WHERE id=v_evidence_id;
  DELETE FROM public.ils_critical_path_evidence_registry WHERE evidence_id=v_evidence_id;
  DELETE FROM public.ils_e2e_function_deployment_registry WHERE function_slug='payment-e2e';
  DELETE FROM public.payments WHERE id=v_payment_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  v_payment_id := gen_random_uuid();
  v_order_id := gen_random_uuid();
  v_evidence_id := gen_random_uuid();
  v_submission_id := gen_random_uuid();
  v_verifier_id := gen_random_uuid();

  INSERT INTO public.orders(id,total,currency,status)
  VALUES(v_order_id,250,'INR','paid');
  INSERT INTO public.payments(
    id,order_id,gateway,gateway_payment_id,amount,currency,status,paid_at
  ) VALUES(v_payment_id,v_order_id,'upi',NULL,250,'INR','paid',now());
  INSERT INTO public.ils_upi_submissions(
    id,order_id,submitted_amount,currency,utr_reference,status,verified_by,verified_at
  ) VALUES(v_submission_id,v_order_id,250,'INR','UTR-CI-123456','VERIFIED',v_verifier_id,now());
  INSERT INTO public.payment_events(id,payment_id,event_type,data)
  VALUES(gen_random_uuid(),v_payment_id,'upi_payment_verified',
    jsonb_build_object('submission_id',v_submission_id));
  INSERT INTO public.ils_upi_verification_events(
    id,submission_id,actor_id,actor_role,action,new_status
  ) VALUES(gen_random_uuid(),v_submission_id,v_verifier_id,'upi_verifier','verify','VERIFIED');
  INSERT INTO public.ils_e2e_evidence(
    id,evidence_class,provenance_class,source_type,authenticated_user_id,
    invocation_correlation_id,function_slug,function_version,function_sha256,
    details,critical_path_code
  ) VALUES (
    v_evidence_id,'VERIFIED','REAL_EXTERNAL','payment',v_user_id,
    'ci-payment-upi-correlation','payment-e2e',1,repeat('b',64),
    jsonb_build_object(
      'payment_id',v_payment_id,'order_id',v_order_id,'submission_id',v_submission_id,
      'upi_verifier_authorized',true,'utr_reference_verified',true,
      'payment_row_verified',true,'order_state_paid',true
    )::text,
    'PAYMENT_E2E'
  );
  INSERT INTO public.ils_critical_path_evidence_registry(id,evidence_id,critical_path_code,binding_status)
  VALUES(gen_random_uuid(),v_evidence_id,'PAYMENT_E2E','BOUND');
  INSERT INTO public.ils_e2e_function_deployment_registry(
    function_slug,function_version,deployment_sha256,critical_path_code,active
  ) VALUES('payment-e2e',1,repeat('b',64),'PAYMENT_E2E',true);

  SELECT * INTO v_summary_after_payment FROM public.ils_release_critical_path_summary();
  IF v_summary_after_payment.verified_paths<>1 THEN
    RAISE EXCEPTION 'Verified UPI submission, payment event and paid order should verify exactly one path; observed %',
      v_summary_after_payment.verified_paths;
  END IF;

  -- The corrected legacy runner is non-mutating and must not claim PASS.
  SELECT * INTO v_hostile
  FROM public.ils_run_critical_path_release_proof_hostile_matrix();
  IF v_hostile.total_tests<>8 OR v_hostile.passed_tests<>0
     OR v_hostile.decision<>'HOLD' THEN
    RAISE EXCEPTION 'Legacy hostile runner must return 8 unexecuted tests and HOLD';
  END IF;

  -- Exercise the PL/pgSQL evaluator only in this disposable database transaction.
  -- The outer ROLLBACK guarantees no test result persists.
  v_gate_id := public.ils_e2e_release_gate_evaluate();
  SELECT decision INTO v_gate_decision
  FROM public.ils_e2e_release_gate_decisions
  WHERE id=v_gate_id;
  IF v_gate_decision<>'HOLD' THEN
    RAISE EXCEPTION 'Empty fixture must remain HOLD, observed %',v_gate_decision;
  END IF;
END;
$test$;

ROLLBACK;
