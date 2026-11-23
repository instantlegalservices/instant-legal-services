-- TEST ONLY. Run after applying
-- 20261123002000_notification_deployment_registry_v3_reconcile.sql.
-- Read-only verification; no writes.

DO $test$
DECLARE
  v_active integer;
  v_v3_hash text;
  v_v2_active boolean;
BEGIN
  SELECT count(*),max(deployment_sha256)
  INTO v_active,v_v3_hash
  FROM public.ils_e2e_function_deployment_registry
  WHERE critical_path_code='NOTIFICATION_E2E'
    AND function_slug='ils-notification-e2e-real'
    AND active=true;

  SELECT active INTO v_v2_active
  FROM public.ils_e2e_function_deployment_registry
  WHERE critical_path_code='NOTIFICATION_E2E'
    AND function_slug='ils-notification-e2e-real'
    AND function_version=2;

  IF v_active <> 1 THEN
    RAISE EXCEPTION 'Expected one active notification function registry row; found %',v_active;
  END IF;
  IF v_v3_hash <> '8fae2850a7e38f69d576d7c43ee891fd970676d5e6834e25d7280d1eb83baa35' THEN
    RAISE EXCEPTION 'Active registry hash does not match live deployed v3: %',v_v3_hash;
  END IF;
  IF coalesce(v_v2_active,true) THEN
    RAISE EXCEPTION 'Stale v2 registry row remains active';
  END IF;
END;
$test$;
