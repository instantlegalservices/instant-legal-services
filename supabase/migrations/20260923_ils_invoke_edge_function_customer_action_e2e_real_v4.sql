-- TEST project bgsbuepolooybdqrzmoa ONLY.
-- Additive trusted invocation interface + promoter-name compatibility wrapper.
-- Does not modify ils_e2e_evidence_promote_verified.
-- Does not write genuine-gate GO.
-- Does not insert evidence rows (capture is performed by the fixed Edge Function).

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ils_invoke_edge_function_customer_action_e2e_real_v4(
  p_user_jwt text,
  p_correlation_id text,
  p_authenticated boolean,
  p_user_verified boolean,
  p_synthetic boolean DEFAULT false,
  p_fixture_only boolean DEFAULT false,
  p_production_access boolean DEFAULT false
)
RETURNS TABLE(
  invocation_allowed boolean,
  reason_code text,
  http_status integer,
  evidence_id uuid,
  function_slug text,
  function_version integer,
  function_sha256 text,
  correlation_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  c_slug constant text := 'ils-customer-action-e2e-real';
  c_ver constant integer := 4;
  c_sha constant text := '4b781c1bbfcaaffcdd4fa316c75765af927bdc14e0d549a46244f1bf1bbd70ff';
  c_url constant text := 'https://bgsbuepolooybdqrzmoa.supabase.co/functions/v1/ils-customer-action-e2e-real';
  c_bridge constant text := 'CUSTOMER_ACTION_REAL_AUTH_V1';
  c_action constant text := 'CAPTURE_REAL_CUSTOMER_ACTION_EVIDENCE';
  c_test_ref constant text := 'bgsbuepolooybdqrzmoa';
  v_b64 text;
  v_payload jsonb;
  v_iss text;
  v_role text;
  v_allowed boolean;
  v_reason text;
  v_req extensions.http_request;
  v_res extensions.http_response;
  v_body jsonb;
  v_evidence uuid;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  IF p_production_access IS DISTINCT FROM false THEN
    RETURN QUERY SELECT false, 'PRODUCTION_ACCESS_FORBIDDEN', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, nullif(trim(p_correlation_id), '');
    RETURN;
  END IF;
  IF p_synthetic IS DISTINCT FROM false OR p_fixture_only IS DISTINCT FROM false THEN
    RETURN QUERY SELECT false, 'SYNTHETIC_OR_FIXTURE_REJECTED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, nullif(trim(p_correlation_id), '');
    RETURN;
  END IF;
  IF p_authenticated IS DISTINCT FROM true OR p_user_verified IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, 'AUTHENTICATION_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, nullif(trim(p_correlation_id), '');
    RETURN;
  END IF;
  IF nullif(trim(p_user_jwt), '') IS NULL THEN
    RETURN QUERY SELECT false, 'JWT_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, nullif(trim(p_correlation_id), '');
    RETURN;
  END IF;
  IF nullif(trim(p_correlation_id), '') IS NULL THEN
    RETURN QUERY SELECT false, 'CORRELATION_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, NULL::text;
    RETURN;
  END IF;
  IF p_user_jwt LIKE '%''%' OR p_user_jwt LIKE '%;%' OR p_correlation_id LIKE '%;%' THEN
    RETURN QUERY SELECT false, 'UNSAFE_INPUT_REJECTED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  v_b64 := split_part(trim(p_user_jwt), '.', 2);
  IF v_b64 IS NULL OR length(v_b64) < 8 THEN
    RETURN QUERY SELECT false, 'JWT_MALFORMED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;
  v_b64 := replace(replace(v_b64, '-', '+'), '_', '/');
  WHILE length(v_b64) % 4 <> 0 LOOP
    v_b64 := v_b64 || '=';
  END LOOP;
  BEGIN
    v_payload := convert_from(decode(v_b64, 'base64'), 'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'JWT_MALFORMED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END;

  v_iss := coalesce(v_payload->>'iss', '');
  v_role := coalesce(v_payload->>'role', v_payload->>'aud', '');
  IF position(c_test_ref in v_iss) = 0 THEN
    RETURN QUERY SELECT false, 'TEST_ISSUER_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN QUERY SELECT false, 'AUTHENTICATED_USER_JWT_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;
  IF coalesce(v_payload->>'sub', '') = '' THEN
    RETURN QUERY SELECT false, 'AUTHENTICATED_USER_REQUIRED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  IF NOT public.ils_customer_action_e2e_sha_provenance_guard_v2(c_slug, c_ver, c_sha) THEN
    RETURN QUERY SELECT false, 'FUNCTION_SHA_NOT_TRUSTED', NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  SELECT x.allowed, x.reason_code
    INTO v_allowed, v_reason
  FROM public.ils_customer_action_e2e_real_provenance_precheck(
    c_slug, c_ver, c_sha, true, true, true, trim(p_correlation_id)
  ) AS x;
  IF v_allowed IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, coalesce(v_reason, 'PROVENANCE_PRECHECK_FAILED'), NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  SELECT x.allowed, x.reason_code
    INTO v_allowed, v_reason
  FROM public.ils_authenticated_e2e_invocation_bridge_contract_check(
    c_bridge, true, true, true, trim(p_correlation_id), c_ver, c_sha, false, false, false, false
  ) AS x;
  IF v_allowed IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, coalesce(v_reason, 'INVOCATION_CONTRACT_REJECTED'), NULL::integer, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  v_req := ROW(
    'POST'::extensions.http_method,
    c_url,
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || trim(p_user_jwt)),
      extensions.http_header('Content-Type', 'application/json')
    ]::extensions.http_header[],
    'application/json',
    json_build_object(
      'action', c_action,
      'correlation_id', trim(p_correlation_id)
    )::text
  )::extensions.http_request;

  v_res := extensions.http(v_req);

  BEGIN
    v_body := v_res.content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_body := NULL;
  END;

  IF v_res.status IS DISTINCT FROM 200 THEN
    RETURN QUERY SELECT false, 'EDGE_INVOKE_FAILED', v_res.status, NULL::uuid, c_slug, c_ver, c_sha, trim(p_correlation_id);
    RETURN;
  END IF;

  BEGIN
    v_evidence := NULLIF(v_body->>'evidence_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_evidence := NULL;
  END;

  RETURN QUERY SELECT true, 'EDGE_INVOKE_ACCEPTED', v_res.status, v_evidence, c_slug, c_ver, c_sha, trim(p_correlation_id);
END;
$function$;

ALTER FUNCTION public.ils_invoke_edge_function_customer_action_e2e_real_v4(
  text, text, boolean, boolean, boolean, boolean, boolean
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ils_invoke_edge_function_customer_action_e2e_real_v4(
  text, text, boolean, boolean, boolean, boolean, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ils_invoke_edge_function_customer_action_e2e_real_v4(
  text, text, boolean, boolean, boolean, boolean, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_invoke_edge_function_customer_action_e2e_real_v4(
  text, text, boolean, boolean, boolean, boolean, boolean
) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.ils_evidence_promote_verified(
  p_evidence_id uuid,
  p_verification_method text,
  p_source_fingerprint text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  RETURN public.ils_e2e_evidence_promote_verified(
    p_evidence_id,
    p_verification_method,
    p_source_fingerprint
  );
END;
$function$;

ALTER FUNCTION public.ils_evidence_promote_verified(uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ils_evidence_promote_verified(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ils_evidence_promote_verified(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_evidence_promote_verified(uuid, text, text) TO postgres, service_role;
