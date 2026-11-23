-- TEST ONLY. Do not apply to Production.
-- Reconcile the canonical deployment registry with the currently deployed
-- fail-closed TEST Edge Function. The v3 source hash is read directly from
-- the live TEST function inventory; v2 is no longer deployed.
--
-- This changes evidence eligibility metadata only. It does not create E2E
-- evidence, enable delivery, or authorize provider invocation.

DO $$
DECLARE
  v_active_count integer;
BEGIN
  SELECT count(*) INTO v_active_count
  FROM public.ils_e2e_function_deployment_registry
  WHERE critical_path_code='NOTIFICATION_E2E'
    AND function_slug='ils-notification-e2e-real'
    AND active=true;

  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active notification deployment registry row before reconciliation; found %', v_active_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ils_e2e_function_deployment_registry
    WHERE critical_path_code='NOTIFICATION_E2E'
      AND function_slug='ils-notification-e2e-real'
      AND function_version=2
      AND deployment_sha256='2022697dbd1534d74efd6f4dbe4303069e0ae9ef7f61e55b7e76b2e8adb072e5'
      AND active=true
  ) THEN
    RAISE EXCEPTION 'Registry baseline differs from inspected v2 active row; stop and reconcile manually';
  END IF;

  UPDATE public.ils_e2e_function_deployment_registry
  SET active=false
  WHERE critical_path_code='NOTIFICATION_E2E'
    AND function_slug='ils-notification-e2e-real'
    AND active=true;

  INSERT INTO public.ils_e2e_function_deployment_registry
    (function_slug,function_version,deployment_sha256,critical_path_code,active)
  VALUES
    ('ils-notification-e2e-real',3,
     '8fae2850a7e38f69d576d7c43ee891fd970676d5e6834e25d7280d1eb83baa35',
     'NOTIFICATION_E2E',true)
  ON CONFLICT (function_slug,function_version)
  DO UPDATE SET
    deployment_sha256=EXCLUDED.deployment_sha256,
    critical_path_code=EXCLUDED.critical_path_code,
    active=true;
END;
$$;

-- Expected postcondition: only v3/hash 8fae... is active for this function.
