-- TEST ONLY. Reconcile release readiness with canonical evidence and observed assertions.
-- Never apply this migration to Production without a separately reviewed promotion.
-- This migration deliberately fails closed: existing synthetic hostile-matrix rows
-- are not runtime assertions and cannot satisfy the release gate.

ALTER TABLE public.ils_critical_path_release_proof_hostile_results
  ADD COLUMN IF NOT EXISTS assertion_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ils_critical_path_release_proof_hostile_results.assertion_verified IS
  'True only when the hostile scenario was actually executed and its observed decision was independently asserted. Historical expected-outcome rows default false.';

CREATE OR REPLACE FUNCTION public.ils_e2e_detail_uuid(p_details text, p_key text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path TO ''
AS $function$
DECLARE
  v_value text;
BEGIN
  IF p_key NOT IN ('payment_id','order_id','submission_id') THEN
    RETURN NULL;
  END IF;

  v_value := substring(
    p_details
    FROM ('"' || p_key || '"[[:space:]]*:[[:space:]]*"([0-9a-fA-F-]{36})"')
  );
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v_value::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_e2e_detail_uuid(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_e2e_detail_uuid(text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ils_run_critical_path_release_proof_hostile_matrix()
RETURNS TABLE(
  total_tests integer,
  passed_tests integer,
  failed_tests integer,
  destructive_attempts integer,
  decision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total integer;
BEGIN
  IF current_user <> 'postgres'
     AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.ils_critical_path_release_proof_hostile_tests;

  -- No hostile scenario is executed by this legacy runner. Do not manufacture
  -- results, delete history, or convert expected BLOCK outcomes into PASS.
  RETURN QUERY SELECT v_total, 0, 0, 0, 'HOLD'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_run_critical_path_release_proof_hostile_matrix()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_run_critical_path_release_proof_hostile_matrix()
  TO service_role;

CREATE OR REPLACE FUNCTION public.ils_release_critical_path_summary()
RETURNS TABLE(
  total_paths bigint,
  verified_paths bigint,
  unverified_paths bigint,
  blocked_paths bigint,
  release_blockers bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active_route_gate AS (
    SELECT
      EXISTS (
        SELECT 1 FROM public.gov_service_routes r
        WHERE r.route_status='ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.gov_service_routes r
        WHERE r.route_status='ACTIVE'
          AND NOT EXISTS (
            SELECT 1
            FROM public.gov_route_verification_snapshots s
            WHERE s.id = (
              SELECT s2.id
              FROM public.gov_route_verification_snapshots s2
              WHERE s2.route_id=r.id
              ORDER BY s2.checked_at DESC, s2.created_at DESC
              LIMIT 1
            )
              AND s.result='PASS'
              AND s.checked_by IS NOT NULL
              AND s.http_status BETWEEN 200 AND 399
              AND s.official_domain_match IS TRUE
              AND s.service_identity_match IS TRUE
              AND s.geography_match IS TRUE
              AND s.authority_match IS TRUE
              AND s.https_ok IS TRUE
              AND s.final_url ~* '^https://'
              AND regexp_replace(lower(split_part(split_part(s.final_url,'/',3),':',1)),'^www[.]','')
                    = regexp_replace(lower(r.official_domain),'^www[.]','')
              AND jsonb_typeof(s.source_snapshot)='object'
              AND s.source_snapshot <> '{}'::jsonb
              AND s.next_check_at > now()
          )
      ) AS ok
  ),
  path_status AS (
    SELECT
      i.path_code,
      i.release_required,
      CASE
        WHEN c.critical_path_code IS NULL
          OR NOT c.active
          OR nullif(trim(c.expected_provenance),'') IS NULL
          OR nullif(trim(c.expected_function_pattern),'') IS NULL
          OR nullif(trim(c.expected_source_pattern),'') IS NULL
          THEN 'BLOCKED'
        WHEN i.path_code='GOV_ROUTE_E2E'
          AND NOT (SELECT ok FROM active_route_gate)
          THEN 'UNVERIFIED'
        WHEN EXISTS (
          SELECT 1
          FROM public.ils_critical_path_evidence_registry r
          JOIN public.ils_e2e_evidence e ON e.id=r.evidence_id
          JOIN public.ils_e2e_function_deployment_registry d
            ON d.critical_path_code=r.critical_path_code
           AND d.function_slug=e.function_slug
           AND d.function_version=e.function_version
           AND lower(d.deployment_sha256)=lower(e.function_sha256)
           AND d.active IS TRUE
          WHERE r.critical_path_code=i.path_code
            AND r.binding_status='BOUND'
            AND e.evidence_class='VERIFIED'
            AND e.provenance_class IN ('REAL_AUTHENTICATED','REAL_EXTERNAL')
            AND e.provenance_class=c.expected_provenance
            AND e.authenticated_user_id IS NOT NULL
            AND nullif(trim(e.invocation_correlation_id),'') IS NOT NULL
            AND nullif(trim(e.function_slug),'') IS NOT NULL
            AND e.function_version IS NOT NULL
            AND nullif(trim(e.function_sha256),'') IS NOT NULL
            AND position(lower(c.expected_function_pattern) in lower(e.function_slug))>0
            AND position(lower(c.expected_source_pattern) in lower(e.source_type))>0
            -- A path/function may have exactly one active deployment identity.
            AND (
              SELECT count(*)
              FROM public.ils_e2e_function_deployment_registry d2
              WHERE d2.critical_path_code=i.path_code
                AND d2.function_slug=e.function_slug
                AND d2.active IS TRUE
            )=1
            AND NOT EXISTS (
              SELECT 1 FROM public.ils_e2e_historical_event_quarantine q
              WHERE q.evidence_id=e.id
            )
            AND (
              i.path_code <> 'NOTIFICATION_E2E'
              OR (
                (
                  e.details ~* '"downstream_delivery_verified"[[:space:]]*:[[:space:]]*true'
                  OR e.details ~* '"in_app_delivery_verified"[[:space:]]*:[[:space:]]*true'
                  OR e.details ~* 'downstream_delivery_verified[[:space:]]*=[[:space:]]*true'
                  OR e.details ~* 'in_app_delivery_verified[[:space:]]*=[[:space:]]*true'
                )
                AND EXISTS (
                  SELECT 1 FROM public.ils_notification_e2e_preflight nf
                  WHERE nf.id = (
                    SELECT nf_latest.id
                    FROM public.ils_notification_e2e_preflight nf_latest
                    WHERE nf_latest.path_code='NOTIFICATION_E2E'
                    ORDER BY nf_latest.created_at DESC, nf_latest.id DESC
                    LIMIT 1
                  )
                    AND nf.status='READY'
                    AND nf.synthetic_only IS FALSE
                    AND nf.real_recipient_data_allowed IS TRUE
                    AND nf.real_message_send_allowed IS TRUE
                    AND nf.customer_data_allowed IS TRUE
                    AND nf.authorization_level='EXPLICIT_OPERATOR_APPROVAL'
                    AND (
                      nf.real_external_delivery_allowed IS FALSE
                      OR nf.external_provider_invocation_allowed IS TRUE
                    )
                )
              )
            )
            AND (
              i.path_code <> 'PAYMENT_E2E'
              OR EXISTS (
                SELECT 1
                FROM public.payments p
                JOIN public.orders o ON o.id=p.order_id
                WHERE p.id=public.ils_e2e_detail_uuid(e.details,'payment_id')
                  AND o.id=public.ils_e2e_detail_uuid(e.details,'order_id')
                  AND p.status='paid'
                  AND p.paid_at IS NOT NULL
                  AND o.status='paid'
                  AND p.amount=o.total
                  AND p.currency=o.currency
                  AND (
                    (
                      p.gateway='razorpay'
                      AND nullif(trim(p.gateway_payment_id),'') IS NOT NULL
                      AND (
                        e.details ~* '"gateway_signature_verified"[[:space:]]*:[[:space:]]*true'
                        OR e.details ~* 'gateway_signature_verified[[:space:]]*=[[:space:]]*true'
                      )
                      AND (
                        e.details ~* '"provider_payment_verified"[[:space:]]*:[[:space:]]*true'
                        OR e.details ~* 'provider_payment_verified[[:space:]]*=[[:space:]]*true'
                      )
                    )
                    OR
                    (
                      p.gateway='upi'
                      AND EXISTS (
                        SELECT 1
                        FROM public.ils_upi_submissions s
                        JOIN public.payment_events pe
                          ON pe.payment_id=p.id
                         AND pe.event_type='upi_payment_verified'
                         AND pe.data->>'submission_id'=s.id::text
                        JOIN public.ils_upi_verification_events ve
                          ON ve.submission_id=s.id
                         AND ve.actor_id=s.verified_by
                         AND ve.actor_role='upi_verifier'
                         AND ve.action='verify'
                         AND ve.new_status='VERIFIED'
                        WHERE s.id=public.ils_e2e_detail_uuid(e.details,'submission_id')
                          AND s.order_id=o.id
                          AND s.status='VERIFIED'
                          AND s.verified_by IS NOT NULL
                          AND s.verified_at IS NOT NULL
                          AND s.submitted_amount=p.amount
                          AND s.currency=p.currency
                          AND nullif(trim(s.utr_reference),'') IS NOT NULL
                      )
                      AND (
                        e.details ~* '"upi_verifier_authorized"[[:space:]]*:[[:space:]]*true'
                        OR e.details ~* 'upi_verifier_authorized[[:space:]]*=[[:space:]]*true'
                      )
                      AND (
                        e.details ~* '"utr_reference_verified"[[:space:]]*:[[:space:]]*true'
                        OR e.details ~* 'utr_reference_verified[[:space:]]*=[[:space:]]*true'
                      )
                    )
                  )
              )
            )
        ) THEN 'VERIFIED'
        ELSE 'UNVERIFIED'
      END AS current_status
    FROM public.ils_release_critical_path_inventory i
    LEFT JOIN public.ils_critical_path_evidence_contracts c
      ON c.critical_path_code=i.path_code
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE current_status='VERIFIED')::bigint,
    count(*) FILTER (WHERE current_status='UNVERIFIED')::bigint,
    count(*) FILTER (WHERE current_status='BLOCKED')::bigint,
    count(*) FILTER (
      WHERE release_required AND current_status<>'VERIFIED'
    )::bigint
  FROM path_status;
$function$;

REVOKE ALL ON FUNCTION public.ils_release_critical_path_summary()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ils_release_critical_path_summary()
  TO service_role;

CREATE OR REPLACE FUNCTION public.ils_e2e_release_gate_evaluate()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_total_paths bigint := 0;
  v_verified_paths bigint := 0;
  v_unverified_paths bigint := 0;
  v_blocked_paths bigint := 0;
  v_verified integer := 0;
  v_sim integer := 0;
  v_unverified integer := 0;
  v_hostile_total integer := 0;
  v_hostile_verified integer := 0;
  v_dedicated_ok boolean := false;
  v_integrity_ok boolean := false;
  v_atomic_ok boolean := false;
  v_unique_deployments_ok boolean := false;
  v_security_attacks_ok boolean := false;
  v_decision text := 'HOLD';
  v_reason text;
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT total_paths,verified_paths,unverified_paths,blocked_paths
    INTO v_total_paths,v_verified_paths,v_unverified_paths,v_blocked_paths
  FROM public.ils_release_critical_path_summary();

  SELECT public.ils_canonical_verified_evidence_count('RELEASE_E2E')
    INTO v_verified;

  SELECT
    count(*) FILTER (
      WHERE evidence_class IN ('SIMULATED','UNVERIFIED')
         OR source_type='SYNTHETIC'
         OR provenance_class='SYNTHETIC'
    ),
    count(*) FILTER (WHERE evidence_class='UNVERIFIED')
  INTO v_sim,v_unverified
  FROM public.ils_e2e_evidence;

  -- Dedicated path decisions must exist and the latest decision must be GO.
  SELECT
    coalesce((
      SELECT g.decision='GO'
        AND g.genuine_verified_evidence_count>=1
        AND g.hostile_tests_passed>=7
        AND g.hostile_tests_failed=0
        AND g.destructive_attempts=0
        AND g.created_at >= greatest(
          coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e WHERE e.critical_path_code='DOCUMENT_E2E'),'-infinity'::timestamptz),
          coalesce((SELECT max(h.created_at) FROM public.ils_document_e2e_harness_runs h),'-infinity'::timestamptz),
          coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
          coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
        )
      FROM public.ils_document_e2e_release_gate_decisions g
      ORDER BY g.created_at DESC LIMIT 1
    ),false)
    AND
    coalesce((
      SELECT g.decision='GO'
        AND g.genuine_verified_evidence_count>=1
        AND g.hostile_tests_passed>=7
        AND g.hostile_tests_failed=0
        AND g.destructive_attempts=0
        AND g.created_at >= greatest(
          coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e WHERE e.critical_path_code='NOTIFICATION_E2E'),'-infinity'::timestamptz),
          coalesce((SELECT max(h.started_at) FROM public.ils_notification_e2e_harness_runs h),'-infinity'::timestamptz),
          coalesce((SELECT max(n.created_at) FROM public.ils_notification_e2e_preflight n WHERE n.path_code='NOTIFICATION_E2E'),'-infinity'::timestamptz),
          coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
          coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
        )
      FROM public.ils_notification_e2e_release_gate_decisions g
      ORDER BY g.created_at DESC LIMIT 1
    ),false)
    AND
    coalesce((
      SELECT g.decision='GO'
        AND g.genuine_verified_evidence_count>=1
        AND g.hostile_tests_passed>=7
        AND g.hostile_tests_failed=0
        AND g.destructive_attempts=0
        AND g.created_at >= greatest(
          coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e WHERE e.critical_path_code='PROFESSIONAL_ASSIGNMENT_E2E'),'-infinity'::timestamptz),
          coalesce((SELECT max(h.created_at) FROM public.ils_professional_assignment_e2e_harness_runs h),'-infinity'::timestamptz),
          coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
          coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
        )
      FROM public.ils_professional_assignment_e2e_release_gate_decisions g
      ORDER BY g.created_at DESC LIMIT 1
    ),false)
    AND
    coalesce((
      SELECT g.status='GO'
        AND g.genuine_verified_evidence>=1
        AND g.hostile_tests_passed>=7
        AND g.hostile_tests_failed=0
        AND g.destructive_attempts=0
        AND g.production_touch_detected IS FALSE
        AND g.created_at >= greatest(
          coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e WHERE e.critical_path_code='SECURITY_EXECUTION_E2E'),'-infinity'::timestamptz),
          coalesce((SELECT max(h.created_at) FROM public.ils_security_execution_e2e_hostile_runs h),'-infinity'::timestamptz),
          coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
          coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
        )
      FROM public.ils_security_execution_e2e_release_gate_decisions g
      ORDER BY g.created_at DESC LIMIT 1
    ),false)
  INTO v_dedicated_ok;

  -- Security execution source assertions and preflight booleans are not hostile
  -- runtime attempts. Require all eight named attacks to be executed and observed.
  SELECT coalesce((
    SELECT r.status='PASS'
       AND r.runtime_checks_failed=0
       AND r.checks_not_executed=0
       AND r.destructive_attempts=0
       AND r.created_at >= greatest(
         coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e),'-infinity'::timestamptz),
         coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
         coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
       )
       AND (
         SELECT count(*)
         FROM public.ils_security_execution_e2e_hostile_run_results x
         WHERE x.run_id=r.id
           AND x.test_method='RUNTIME_ATTACK'
           AND x.created_at >= r.created_at
           AND x.observed_status='PASS'
           AND x.passed IS TRUE
           AND x.destructive_attempted IS FALSE
           AND x.test_code IN (
             'PREFLIGHT_BYPASS','UNAUTHORIZED_EXECUTION','REAL_EXECUTION',
             'REAL_APPROVAL','REPLAY_NONCE','SNAPSHOT_TAMPER',
             'EXPIRED_BINDING','DESTRUCTIVE_ACTION'
           )
       )=8
       AND (
         SELECT count(DISTINCT x.test_code)
         FROM public.ils_security_execution_e2e_hostile_run_results x
         WHERE x.run_id=r.id
           AND x.test_method='RUNTIME_ATTACK'
           AND x.created_at >= r.created_at
           AND x.observed_status='PASS'
           AND x.passed IS TRUE
           AND x.destructive_attempted IS FALSE
           AND x.test_code IN (
             'PREFLIGHT_BYPASS','UNAUTHORIZED_EXECUTION','REAL_EXECUTION',
             'REAL_APPROVAL','REPLAY_NONCE','SNAPSHOT_TAMPER',
             'EXPIRED_BINDING','DESTRUCTIVE_ACTION'
           )
       )=8
       AND NOT EXISTS (
         SELECT 1
         FROM public.ils_security_execution_e2e_hostile_run_results x
         WHERE x.run_id=r.id
           AND (x.passed IS DISTINCT FROM TRUE OR x.destructive_attempted IS TRUE)
       )
    FROM public.ils_security_execution_e2e_hostile_runs r
    ORDER BY r.created_at DESC,r.id DESC
    LIMIT 1
  ),false)
  INTO v_security_attacks_ok;

  -- Historical expected-outcome rows are not observed hostile assertions.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE r.assertion_verified IS TRUE
             AND r.passed IS TRUE
             AND r.actual_decision=t.expected_decision
             AND r.destructive_attempted IS FALSE
             AND r.created_at >= greatest(
               coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e),'-infinity'::timestamptz),
               coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
               coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz),
               coalesce((SELECT max(t2.created_at) FROM public.ils_critical_path_release_proof_hostile_tests t2),'-infinity'::timestamptz)
             )
         )::integer
  INTO v_hostile_total,v_hostile_verified
  FROM public.ils_critical_path_release_proof_hostile_tests t
  LEFT JOIN public.ils_critical_path_release_proof_hostile_results r
    ON r.test_id=t.id;

  -- The most recent binding-integrity audit must be a clean PASS.
  SELECT coalesce((
    SELECT a.decision='PASS'
       AND a.orphan_registry_rows=0
       AND a.duplicate_evidence_bindings=0
       AND a.cross_path_conflicts=0
       AND a.orphan_evidence=0
       AND a.created_at >= greatest(
         coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e),'-infinity'::timestamptz),
         coalesce((SELECT max(r.created_at) FROM public.ils_critical_path_evidence_registry r),'-infinity'::timestamptz),
         coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
         coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
       )
    FROM public.ils_critical_path_evidence_binding_integrity_audit a
    ORDER BY a.created_at DESC
    LIMIT 1
  ),false)
  INTO v_integrity_ok;

  -- Conflicting active deployment versions are not a valid release identity.
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.ils_e2e_function_deployment_registry d
    WHERE d.active IS TRUE
    GROUP BY d.critical_path_code,d.function_slug
    HAVING count(*)>1
  )
  INTO v_unique_deployments_ok;

  -- A current atomic proof must agree with all eight canonical paths.
  SELECT coalesce((
    SELECT p.decision='PASS'
       AND p.total_paths=8
       AND p.passed_paths=8
       AND p.held_paths=0
       AND p.failed_paths=0
       AND p.destructive_attempts=0
       AND p.created_at >= greatest(
         coalesce((SELECT max(e.created_at) FROM public.ils_e2e_evidence e),'-infinity'::timestamptz),
         coalesce((SELECT max(r.created_at) FROM public.ils_critical_path_evidence_registry r),'-infinity'::timestamptz),
         coalesce((SELECT max(d.created_at) FROM public.ils_e2e_function_deployment_registry d),'-infinity'::timestamptz),
         coalesce((SELECT max(c.created_at) FROM public.ils_critical_path_evidence_contracts c),'-infinity'::timestamptz)
       )
    FROM public.ils_critical_path_release_proof_runs p
    ORDER BY p.created_at DESC
    LIMIT 1
  ),false)
  INTO v_atomic_ok;

  IF v_total_paths=8
     AND v_verified_paths=8
     AND v_unverified_paths=0
     AND v_blocked_paths=0
     AND v_unverified=0
     AND v_dedicated_ok
     AND v_hostile_total=8
     AND v_hostile_verified=v_hostile_total
     AND v_integrity_ok
     AND v_unique_deployments_ok
     AND v_security_attacks_ok
     AND v_atomic_ok
  THEN
    v_decision:='GO';
    v_reason:='All eight paths have deployment-matched canonical evidence; dedicated gates, observed hostile assertions, binding integrity, unique active deployments, and latest atomic proof all pass.';
  ELSE
    v_decision:=CASE WHEN v_blocked_paths>0 THEN 'FAIL' ELSE 'HOLD' END;
    v_reason:=format(
      'Fail-closed release check: paths=%s, verified=%s, unverified_paths=%s, blocked=%s, global_unverified_evidence=%s, dedicated_gates_go=%s, hostile_assertions=%s/%s, binding_integrity_pass=%s, unique_active_deployments=%s, security_runtime_attacks_pass=%s, latest_atomic_proof_pass=%s.',
      v_total_paths,v_verified_paths,v_unverified_paths,v_blocked_paths,
      v_unverified,v_dedicated_ok,v_hostile_verified,v_hostile_total,
      v_integrity_ok,v_unique_deployments_ok,v_security_attacks_ok,v_atomic_ok
    );
  END IF;

  INSERT INTO public.ils_e2e_release_gate_decisions(
    gate_code,decision,verified_count,simulated_count,unverified_count,reason
  )
  VALUES(
    'E2E_RELEASE_GATE',v_decision,v_verified_paths::integer,v_sim,v_unverified,v_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_e2e_release_gate_evaluate()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_e2e_release_gate_evaluate()
  TO service_role;
