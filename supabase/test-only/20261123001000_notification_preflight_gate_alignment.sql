-- TEST ONLY. Do not apply to Production.
-- Align notification preflight, notification E2E release gate, and atomic
-- critical-path proof. Real paths require explicit operator approval.
-- In-app-only delivery is valid when external delivery is disabled; if
-- external delivery is enabled, provider invocation must also be authorized.

CREATE OR REPLACE FUNCTION public.ils_notification_e2e_preflight_check()
 RETURNS TABLE(status text, violations integer, real_external_delivery_allowed boolean, real_recipient_data_allowed boolean, real_message_send_allowed boolean, customer_data_allowed boolean, external_provider_invocation_allowed boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN (
        -- Safe synthetic-only test mode.
        synthetic_only
        AND NOT real_external_delivery_allowed
        AND NOT real_recipient_data_allowed
        AND NOT real_message_send_allowed
        AND NOT customer_data_allowed
        AND NOT external_provider_invocation_allowed
      ) OR (
        -- Explicitly authorized real-path mode. No row is created or authorized here.
        NOT synthetic_only
        AND authorization_level = 'EXPLICIT_OPERATOR_APPROVAL'
        AND real_recipient_data_allowed
        AND real_message_send_allowed
        AND customer_data_allowed
        AND (
          NOT real_external_delivery_allowed
          OR external_provider_invocation_allowed
        )
      )
      THEN 'READY'
      ELSE 'FAIL'
    END,
    CASE
      WHEN (
        synthetic_only
        AND NOT real_external_delivery_allowed
        AND NOT real_recipient_data_allowed
        AND NOT real_message_send_allowed
        AND NOT customer_data_allowed
        AND NOT external_provider_invocation_allowed
      ) OR (
        NOT synthetic_only
        AND authorization_level = 'EXPLICIT_OPERATOR_APPROVAL'
        AND real_recipient_data_allowed
        AND real_message_send_allowed
        AND customer_data_allowed
        AND (
          NOT real_external_delivery_allowed
          OR external_provider_invocation_allowed
        )
      )
      THEN 0
      ELSE
        (CASE WHEN synthetic_only THEN 0 ELSE 1 END
         + CASE WHEN NOT synthetic_only AND authorization_level <> 'EXPLICIT_OPERATOR_APPROVAL' THEN 1 ELSE 0 END
         + CASE WHEN synthetic_only AND real_external_delivery_allowed THEN 1 ELSE 0 END
         + CASE WHEN synthetic_only AND real_recipient_data_allowed THEN 1 ELSE 0 END
         + CASE WHEN synthetic_only AND real_message_send_allowed THEN 1 ELSE 0 END
         + CASE WHEN synthetic_only AND customer_data_allowed THEN 1 ELSE 0 END
         + CASE WHEN synthetic_only AND external_provider_invocation_allowed THEN 1 ELSE 0 END
         + CASE WHEN NOT real_recipient_data_allowed THEN 1 ELSE 0 END
         + CASE WHEN NOT real_message_send_allowed THEN 1 ELSE 0 END
         + CASE WHEN NOT customer_data_allowed THEN 1 ELSE 0 END
         + CASE WHEN real_external_delivery_allowed AND NOT external_provider_invocation_allowed THEN 1 ELSE 0 END)
    END,
    real_external_delivery_allowed,
    real_recipient_data_allowed,
    real_message_send_allowed,
    customer_data_allowed,
    external_provider_invocation_allowed
  FROM public.ils_notification_e2e_preflight
  WHERE path_code='NOTIFICATION_E2E';
$function$

CREATE OR REPLACE FUNCTION public.ils_notification_e2e_release_gate_evaluate()
 RETURNS TABLE(decision text, genuine_verified_evidence_count integer, synthetic_evidence_count integer, hostile_tests_passed integer, hostile_tests_failed integer, destructive_attempts integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_genuine integer := 0;
  v_delivery_evidence integer := 0;
  v_synth integer := 0;
  v_pass integer := 0;
  v_fail integer := 0;
  v_dest integer := 0;
  v_run uuid;
  v_preflight record;
  v_decision text;
  v_reason text;
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT public.ils_canonical_verified_evidence_count('NOTIFICATION_E2E')
    INTO v_genuine;

  SELECT count(*) FILTER (
    WHERE coalesce(source_type,'REAL')='SYNTHETIC'
       OR provenance_class='SYNTHETIC'
       OR evidence_class='SIMULATED'
  )
  INTO v_synth
  FROM public.ils_e2e_evidence;

  -- A VERIFIED row alone is insufficient: require explicit delivery proof
  -- in the evidence record, not merely ingress acceptance.
  SELECT count(*) INTO v_delivery_evidence
  FROM public.ils_e2e_evidence e
  JOIN public.ils_critical_path_evidence_registry r
    ON r.evidence_id=e.id
   AND r.binding_status='BOUND'
   AND r.critical_path_code='NOTIFICATION_E2E'
  JOIN public.ils_critical_path_evidence_contracts c
    ON c.critical_path_code='NOTIFICATION_E2E'
   AND c.active
   AND c.expected_provenance=e.provenance_class
  WHERE e.evidence_class='VERIFIED'
    AND e.provenance_class IN ('REAL_AUTHENTICATED','REAL_EXTERNAL')
    AND e.authenticated_user_id IS NOT NULL
    AND nullif(trim(e.invocation_correlation_id),'') IS NOT NULL
    AND nullif(trim(e.function_slug),'') IS NOT NULL
    AND e.function_version IS NOT NULL
    AND nullif(trim(e.function_sha256),'') IS NOT NULL
    AND position(lower(c.expected_function_pattern) in lower(e.function_slug))>0
    AND position(lower(c.expected_source_pattern) in lower(e.source_type))>0
    AND (
      e.details ~* '"downstream_delivery_verified"[[:space:]]*:[[:space:]]*true'
      OR e.details ~* '"in_app_delivery_verified"[[:space:]]*:[[:space:]]*true'
      OR e.details ~* 'downstream_delivery_verified[[:space:]]*=[[:space:]]*true'
      OR e.details ~* 'in_app_delivery_verified[[:space:]]*=[[:space:]]*true'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.ils_e2e_historical_event_quarantine q
      WHERE q.evidence_id=e.id
    );

  SELECT * INTO v_preflight
  FROM public.ils_notification_e2e_preflight
  WHERE path_code='NOTIFICATION_E2E'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT id INTO v_run
  FROM public.ils_notification_e2e_harness_runs
  WHERE completed_at IS NOT NULL
  ORDER BY completed_at DESC
  LIMIT 1;

  IF v_run IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE passed),
           count(*) FILTER (WHERE NOT passed),
           count(*) FILTER (WHERE destructive_attempted)
      INTO v_pass,v_fail,v_dest
    FROM public.ils_notification_e2e_harness_results
    WHERE run_id=v_run;
  END IF;

  IF v_genuine>=1
     AND v_delivery_evidence>=1
     AND v_run IS NOT NULL
     AND v_pass>=7
     AND v_fail=0
     AND v_dest=0
     AND coalesce(v_preflight.status,'MISSING')='READY'
     AND coalesce(v_preflight.synthetic_only,true)=false
     AND coalesce(v_preflight.real_recipient_data_allowed,false)=true
     AND coalesce(v_preflight.real_message_send_allowed,false)=true
     AND coalesce(v_preflight.customer_data_allowed,false)=true
     AND coalesce(v_preflight.authorization_level,'')='EXPLICIT_OPERATOR_APPROVAL'
     AND (
       NOT coalesce(v_preflight.real_external_delivery_allowed,true)
       OR coalesce(v_preflight.external_provider_invocation_allowed,false)
     )
  THEN
    v_decision:='GO';
    v_reason:='Verified path-bound notification delivery evidence, real-path preflight authorization, and latest safety harness pass are all required';
  ELSE
    v_decision:='HOLD';
    v_reason:='Requires verified downstream/in-app delivery evidence, authorized non-synthetic preflight, and a complete passing safety harness';
  END IF;

  INSERT INTO public.ils_notification_e2e_release_gate_decisions(
    decision,genuine_verified_evidence_count,synthetic_evidence_count,
    hostile_tests_passed,hostile_tests_failed,destructive_attempts,reason
  )
  VALUES(v_decision,v_genuine,v_synth,v_pass,v_fail,v_dest,v_reason);

  RETURN QUERY SELECT v_decision,v_genuine,v_synth,v_pass,v_fail,v_dest,v_reason;
END;
$function$

CREATE OR REPLACE FUNCTION public.ils_run_critical_path_atomic_release_proof()
 RETURNS TABLE(run_id uuid, decision text, total_paths integer, passed_paths integer, held_paths integer, failed_paths integer, destructive_attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_run uuid;
  v_total integer;
  v_pass integer := 0;
  v_hold integer := 0;
  v_fail integer := 0;
  v_decision text;
BEGIN
  IF current_user <> 'postgres' AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT count(*) INTO v_total FROM public.ils_critical_path_evidence_contracts;
  INSERT INTO public.ils_critical_path_release_proof_runs
    (decision,total_paths,passed_paths,held_paths,failed_paths,destructive_attempts)
  VALUES ('HOLD',v_total,0,0,0,0) RETURNING id INTO v_run;

  INSERT INTO public.ils_critical_path_release_proof_results
    (run_id,critical_path_code,binding_ok,contract_ok,promotion_ready,decision,reason_code)
  SELECT v_run,c.critical_path_code,
    ev.has_eligible_evidence,
    (c.active AND nullif(trim(c.expected_provenance),'') IS NOT NULL
      AND nullif(trim(c.expected_function_pattern),'') IS NOT NULL
      AND nullif(trim(c.expected_source_pattern),'') IS NOT NULL),
    (ev.has_eligible_evidence AND c.active
      AND nullif(trim(c.expected_provenance),'') IS NOT NULL
      AND nullif(trim(c.expected_function_pattern),'') IS NOT NULL
      AND nullif(trim(c.expected_source_pattern),'') IS NOT NULL),
    CASE
      WHEN NOT c.active OR nullif(trim(c.expected_provenance),'') IS NULL
        OR nullif(trim(c.expected_function_pattern),'') IS NULL
        OR nullif(trim(c.expected_source_pattern),'') IS NULL THEN 'BLOCK'
      WHEN ev.has_eligible_evidence THEN 'PASS'
      ELSE 'HOLD'
    END,
    CASE
      WHEN NOT c.active OR nullif(trim(c.expected_provenance),'') IS NULL
        OR nullif(trim(c.expected_function_pattern),'') IS NULL
        OR nullif(trim(c.expected_source_pattern),'') IS NULL THEN 'INVALID_OR_INACTIVE_EVIDENCE_CONTRACT'
      WHEN ev.has_eligible_evidence THEN 'CANONICAL_VERIFIED_EVIDENCE_PRESENT'
      WHEN c.critical_path_code='NOTIFICATION_E2E' THEN 'NO_VERIFIED_NOTIFICATION_DELIVERY_EVIDENCE_OR_REAL_PATH_PREFLIGHT'
      WHEN c.critical_path_code='PAYMENT_E2E' THEN 'NO_VERIFIED_PROVIDER_AND_PERSISTED_PAYMENT_STATE_EVIDENCE'
      ELSE 'NO_VERIFIED_REAL_EVIDENCE_MATCHING_ACTIVE_DEPLOYMENT'
    END
  FROM public.ils_critical_path_evidence_contracts c
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM public.ils_critical_path_evidence_registry r
      JOIN public.ils_e2e_evidence e ON e.id=r.evidence_id
      JOIN public.ils_e2e_function_deployment_registry d
        ON d.critical_path_code=r.critical_path_code
       AND d.function_slug=e.function_slug
       AND d.function_version=e.function_version
       AND lower(d.deployment_sha256)=lower(e.function_sha256)
       AND d.active=true
      WHERE r.critical_path_code=c.critical_path_code
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
        AND NOT EXISTS (
          SELECT 1 FROM public.ils_e2e_historical_event_quarantine q
          WHERE q.evidence_id=e.id
        )
        AND (
          c.critical_path_code <> 'NOTIFICATION_E2E'
          OR (
            (
              e.details ~* '"downstream_delivery_verified"[[:space:]]*:[[:space:]]*true'
              OR e.details ~* '"in_app_delivery_verified"[[:space:]]*:[[:space:]]*true'
              OR e.details ~* 'downstream_delivery_verified[[:space:]]*=[[:space:]]*true'
              OR e.details ~* 'in_app_delivery_verified[[:space:]]*=[[:space:]]*true'
            )
            AND EXISTS (
              SELECT 1 FROM public.ils_notification_e2e_preflight nf
              WHERE nf.path_code='NOTIFICATION_E2E'
                AND nf.status='READY'
                AND nf.synthetic_only=false
                AND nf.real_recipient_data_allowed=true
                AND nf.real_message_send_allowed=true
                AND nf.customer_data_allowed=true
                AND nf.authorization_level='EXPLICIT_OPERATOR_APPROVAL'
                AND (
                  NOT nf.real_external_delivery_allowed
                  OR nf.external_provider_invocation_allowed
                )
            )
          )
        )
        AND (
          c.critical_path_code <> 'PAYMENT_E2E'
          OR (
            (
              (
                (
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
                (
                  e.details ~* '"upi_verifier_authorized"[[:space:]]*:[[:space:]]*true'
                  OR e.details ~* 'upi_verifier_authorized[[:space:]]*=[[:space:]]*true'
                )
                AND (
                  e.details ~* '"utr_reference_verified"[[:space:]]*:[[:space:]]*true'
                  OR e.details ~* 'utr_reference_verified[[:space:]]*=[[:space:]]*true'
                )
              )
            )
            AND (
              e.details ~* '"payment_row_verified"[[:space:]]*:[[:space:]]*true'
              OR e.details ~* 'payment_row_verified[[:space:]]*=[[:space:]]*true'
            )
            AND (
              e.details ~* '"order_state_paid"[[:space:]]*:[[:space:]]*true'
              OR e.details ~* 'order_state_paid[[:space:]]*=[[:space:]]*true'
            )
          )
        )
    ) AS has_eligible_evidence
  ) ev
  ON CONFLICT DO NOTHING;

  SELECT count(*) FILTER(WHERE x.decision='PASS'),
         count(*) FILTER(WHERE x.decision='HOLD'),
         count(*) FILTER(WHERE x.decision='BLOCK')
    INTO v_pass,v_hold,v_fail
  FROM public.ils_critical_path_release_proof_results x WHERE x.run_id=v_run;

  v_decision:=CASE WHEN v_fail>0 THEN 'FAIL' WHEN v_hold>0 THEN 'HOLD' ELSE 'PASS' END;
  UPDATE public.ils_critical_path_release_proof_runs
    SET decision=v_decision,passed_paths=v_pass,held_paths=v_hold,failed_paths=v_fail,destructive_attempts=0
    WHERE id=v_run;
  RETURN QUERY SELECT v_run,v_decision,v_total,v_pass,v_hold,v_fail,0;
END;
$function$
