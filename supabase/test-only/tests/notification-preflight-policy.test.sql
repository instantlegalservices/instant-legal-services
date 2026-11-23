-- TEST ONLY. Run in the TEST SQL editor after applying
-- 20261123001000_notification_preflight_gate_alignment.sql.
-- Every data change is rolled back at the end. Do not run in Production.

BEGIN;

DO $test$
DECLARE
  v record;
  v_rows integer;
  v_gate_definition text;
  v_atomic_definition text;
BEGIN
  UPDATE public.ils_notification_e2e_preflight
  SET synthetic_only=true,
      real_external_delivery_allowed=false,
      real_recipient_data_allowed=false,
      real_message_send_allowed=false,
      customer_data_allowed=false,
      external_provider_invocation_allowed=false,
      authorization_level='SECURITY_REVIEW',
      status='READY'
  WHERE path_code='NOTIFICATION_E2E';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one notification preflight row, found %', v_rows;
  END IF;

  SELECT * INTO v FROM public.ils_notification_e2e_preflight_check();
  IF v.status <> 'READY' OR v.violations <> 0 THEN
    RAISE EXCEPTION 'Synthetic-only safe mode should be READY/0; got %/%', v.status, v.violations;
  END IF;

  -- Verify the TEST-only partial unique index enforces one active ISSUED row.
  DECLARE
    v_synthetic uuid := gen_random_uuid();
    v_operator uuid := gen_random_uuid();
    v_duplicate_rejected boolean := false;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public'
        AND indexname='ils_test_synthetic_auth_handoffs_one_issued_per_user_uidx'
        AND indexdef ILIKE '%WHERE (status = ''ISSUED''::text)%'
    ) THEN
      RAISE EXCEPTION 'One-active-issued partial unique index is missing';
    END IF;

    INSERT INTO public.ils_test_synthetic_auth_handoffs
      (synthetic_user_id,operator_user_id,status,correlation_id,expires_at)
    VALUES
      (v_synthetic,v_operator,'ISSUED',gen_random_uuid()::text,now()+interval '10 minutes');

    BEGIN
      INSERT INTO public.ils_test_synthetic_auth_handoffs
        (synthetic_user_id,operator_user_id,status,correlation_id,expires_at)
      VALUES
        (v_synthetic,v_operator,'ISSUED',gen_random_uuid()::text,now()+interval '10 minutes');
    EXCEPTION WHEN unique_violation THEN
      v_duplicate_rejected := true;
    END;

    IF NOT v_duplicate_rejected THEN
      RAISE EXCEPTION 'Duplicate active ISSUED handoff was not rejected';
    END IF;
  END;

  -- Real in-app path without explicit operator approval must fail closed.
  UPDATE public.ils_notification_e2e_preflight
  SET synthetic_only=false,
      real_external_delivery_allowed=false,
      real_recipient_data_allowed=true,
      real_message_send_allowed=true,
      customer_data_allowed=true,
      external_provider_invocation_allowed=false,
      authorization_level='SECURITY_REVIEW',
      status='READY'
  WHERE path_code='NOTIFICATION_E2E';
  SELECT * INTO v FROM public.ils_notification_e2e_preflight_check();
  IF v.status <> 'FAIL' OR v.violations < 1 THEN
    RAISE EXCEPTION 'Real in-app path without explicit approval must FAIL; got %/%', v.status, v.violations;
  END IF;

  -- Explicitly approved in-app path is valid without an external provider.
  UPDATE public.ils_notification_e2e_preflight
  SET authorization_level='EXPLICIT_OPERATOR_APPROVAL'
  WHERE path_code='NOTIFICATION_E2E';
  SELECT * INTO v FROM public.ils_notification_e2e_preflight_check();
  IF v.status <> 'READY' OR v.violations <> 0 THEN
    RAISE EXCEPTION 'Approved in-app path should be READY/0; got %/%', v.status, v.violations;
  END IF;

  -- External delivery requires the provider invocation flag as well.
  UPDATE public.ils_notification_e2e_preflight
  SET real_external_delivery_allowed=true,
      external_provider_invocation_allowed=false
  WHERE path_code='NOTIFICATION_E2E';
  SELECT * INTO v FROM public.ils_notification_e2e_preflight_check();
  IF v.status <> 'FAIL' OR v.violations < 1 THEN
    RAISE EXCEPTION 'External path without provider authorization must FAIL; got %/%', v.status, v.violations;
  END IF;

  UPDATE public.ils_notification_e2e_preflight
  SET external_provider_invocation_allowed=true
  WHERE path_code='NOTIFICATION_E2E';
  SELECT * INTO v FROM public.ils_notification_e2e_preflight_check();
  IF v.status <> 'READY' OR v.violations <> 0 THEN
    RAISE EXCEPTION 'Approved external path should be READY/0; got %/%', v.status, v.violations;
  END IF;

  SELECT pg_get_functiondef(
    'public.ils_notification_e2e_release_gate_evaluate()'::regprocedure
  ) INTO v_gate_definition;
  IF position('v_preflight.authorization_level' in v_gate_definition)=0
     OR position('v_preflight.real_external_delivery_allowed' in v_gate_definition)=0
     OR position('v_preflight.external_provider_invocation_allowed' in v_gate_definition)=0 THEN
    RAISE EXCEPTION 'Dedicated notification release gate is missing the aligned authorization/provider predicates';
  END IF;

  SELECT pg_get_functiondef(
    'public.ils_run_critical_path_atomic_release_proof()'::regprocedure
  ) INTO v_atomic_definition;
  IF position('nf.authorization_level' in v_atomic_definition)=0
     OR position('NOT nf.real_external_delivery_allowed' in v_atomic_definition)=0
     OR position('OR nf.external_provider_invocation_allowed' in v_atomic_definition)=0 THEN
    RAISE EXCEPTION 'Atomic critical-path proof is missing explicit approval or in-app/external channel alignment';
  END IF;
  IF position('nf.external_provider_invocation_allowed=true' in v_atomic_definition)>0 THEN
    RAISE EXCEPTION 'Atomic proof still hard-requires provider invocation for in-app-only delivery';
  END IF;
END;
$test$;

ROLLBACK;
