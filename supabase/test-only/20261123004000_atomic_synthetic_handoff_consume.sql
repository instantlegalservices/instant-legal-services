-- TEST ONLY. Do not apply to Production.
-- Revalidate the issuing operator and consume the exact handoff in one transaction.
-- Lock order is operator first, then handoff; operator deactivation uses the same
-- row lock and therefore cannot race a stale preflight authorization check.

DO $preflight$
BEGIN
  IF to_regclass('public.ils_test_synthetic_provision_operators') IS NULL
     OR to_regclass('public.ils_test_synthetic_auth_handoffs') IS NULL THEN
    RAISE EXCEPTION 'Required TEST synthetic operator/handoff tables are missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.ils_test_consume_synthetic_auth_handoff(
  p_handoff_id uuid,
  p_synthetic_user_id uuid,
  p_operator_user_id uuid,
  p_token_hash_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_operator_active boolean;
BEGIN
  IF p_handoff_id IS NULL
     OR p_synthetic_user_id IS NULL
     OR p_operator_user_id IS NULL
     OR p_token_hash_sha256 IS NULL
     OR p_token_hash_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT o.active INTO v_operator_active
  FROM public.ils_test_synthetic_provision_operators o
  WHERE o.operator_user_id = p_operator_user_id
    AND o.role = 'TEST_PROVISION_OPERATOR'
  FOR UPDATE;

  IF NOT FOUND OR v_operator_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  UPDATE public.ils_test_synthetic_auth_handoffs h
  SET status = 'CONSUMED',
      consumed_at = clock_timestamp()
  WHERE h.id = p_handoff_id
    AND h.synthetic_user_id = p_synthetic_user_id
    AND h.operator_user_id = p_operator_user_id
    AND h.status = 'ISSUED'
    AND h.token_hash_sha256 = p_token_hash_sha256
    AND h.expires_at > clock_timestamp();

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_test_consume_synthetic_auth_handoff(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_test_consume_synthetic_auth_handoff(uuid,uuid,uuid,text)
  TO service_role;
