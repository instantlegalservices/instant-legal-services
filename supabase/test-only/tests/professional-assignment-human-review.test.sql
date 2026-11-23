-- Runtime tests for human-reviewed assignment mutation escalations.
-- STOP creates a pending review item only; no automatic freeze or mutation.
BEGIN;
DO $test$
DECLARE
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  target_professional_id uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_reviewer_id uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assignment_id uuid:=gen_random_uuid();
  telemetry_assignment_1 uuid:=gen_random_uuid();
  telemetry_assignment_2 uuid:=gen_random_uuid();
  telemetry_assignment_3 uuid:=gen_random_uuid();
  telemetry_assignment_4 uuid:=gen_random_uuid();
  v_event_id uuid;
  v_event_id_retry uuid;
  v_telemetry_count integer;
  ambiguous_queue_id uuid:=gen_random_uuid();
  mismatch_queue_id uuid:=gen_random_uuid();
  mismatch_escalation_id uuid:=gen_random_uuid();
  v_stop_queue_id uuid;
  ambiguous_escalation_id uuid:=gen_random_uuid();
  v_approval_log_id uuid;
  v_count integer;
  v_status text;
  v_queues integer;
  v_escalations integer;
  err text;
BEGIN
  -- Preserve Action 613/615 internal RPC lockdown.
  IF has_function_privilege('authenticated',
       'public.ils_professional_assignment_mutation_gate(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role unexpectedly has internal mutation-gate EXECUTE';
  END IF;
  IF has_function_privilege('authenticated',
       'public.ils_professional_assignment_mutation_commit(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role unexpectedly has internal mutation-commit EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.ils_professional_assignment_mutation_commit(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lacks internal mutation-commit EXECUTE';
  END IF;

  INSERT INTO public.ils_professional_assignment_mutation_alert_thresholds
    (failure_code,window_minutes,review_threshold,stop_threshold,action,active)
  VALUES
    ('CROSS_USER_ASSIGNMENT',15,2,4,'STOP_MUTATION_CHANNEL',true),
    ('INVALID_OPERATION',5,2,3,'REVIEW',true);

  INSERT INTO public.ils_professional_assignment_mutation_alert_escalation_rules
    (decision,action_code,severity,requires_human_approval,destructive_action_allowed,active)
  VALUES
    ('REVIEW','CREATE_SECURITY_REVIEW','MEDIUM',true,false,true),
    ('STOP','FREEZE_MUTATION_CHANNEL','CRITICAL',true,false,true);

  INSERT INTO public.ils_professional_work_assignment_links
    (id,work_item_id,work_stream,professional_user_id,link_status)
  VALUES
    (assignment_id,gen_random_uuid(),'PROFESSIONAL',actor,'APPROVED'),
    (telemetry_assignment_1,gen_random_uuid(),'PROFESSIONAL',target_professional_id,'PENDING'),
    (telemetry_assignment_2,gen_random_uuid(),'PROFESSIONAL',target_professional_id,'PENDING'),
    (telemetry_assignment_3,gen_random_uuid(),'PROFESSIONAL',target_professional_id,'PENDING'),
    (telemetry_assignment_4,gen_random_uuid(),'PROFESSIONAL',target_professional_id,'PENDING');

  INSERT INTO public.ils_professional_security_reviewer_authorizations
    (user_id,reviewer_role,authorization_status,identity_verified,security_training_verified)
  VALUES
    (actor,'SECURITY_ADMIN','ACTIVE',true,true),
    (v_reviewer_id,'SECURITY_REVIEWER','ACTIVE',true,true);

  -- Unauthenticated events are legacy/untrusted and cannot trigger escalation.
  IF EXISTS(SELECT 1 FROM public.ils_professional_assignment_mutation_alert_thresholds
            WHERE failure_code='AUTH_REQUIRED' AND active) THEN
    RAISE EXCEPTION 'AUTH_REQUIRED threshold must be inactive';
  END IF;
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry
    (professional_user_id,failure_code,failure_class,safe_message,source_gate)
  VALUES (actor,'AUTH_REQUIRED','AUTHENTICATION','Unauthenticated request rejected.','UNTRUSTED_EDGE_AUTH');
  IF EXISTS(SELECT 1 FROM public.ils_professional_assignment_mutation_telemetry_aggregate(15)
            WHERE failure_code='AUTH_REQUIRED' AND observed_count>0) THEN
    RAISE EXCEPTION 'Legacy AUTH_REQUIRED telemetry influenced trusted aggregation';
  END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  BEGIN
    PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
      actor,telemetry_assignment_1,'ACTIVATE','ACTIVE','AUTH_REQUIRED');
    RAISE EXCEPTION 'ASSERT_EXPECTED_AUTH_REQUIRED_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'MUTATION_TELEMETRY_FAILURE_CODE_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  IF has_table_privilege('service_role',
       'public.ils_professional_assignment_mutation_failure_telemetry','INSERT')
     OR has_table_privilege('service_role',
       'public.ils_professional_assignment_mutation_failure_telemetry','UPDATE')
     OR has_table_privilege('service_role',
       'public.ils_professional_assignment_mutation_failure_telemetry','DELETE')
     OR has_table_privilege('service_role',
       'public.ils_professional_assignment_mutation_failure_telemetry','TRUNCATE') THEN
    RAISE EXCEPTION 'service_role can bypass the trusted append-only telemetry producer';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.ils_professional_assignment_record_trusted_mutation_failure(uuid,uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.ils_professional_assignment_record_trusted_mutation_failure(uuid,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Trusted telemetry producer privilege boundary is incorrect';
  END IF;

  -- Producer requires the service-role context and emits server-classified events.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  -- A REVIEW-only threshold reaching STOP is a configuration contradiction.
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_1,'UNKNOWN',NULL,'INVALID_OPERATION');
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_2,'UNKNOWN',NULL,'INVALID_OPERATION');
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_3,'UNKNOWN',NULL,'INVALID_OPERATION');
  SELECT id INTO v_event_id
  FROM public.ils_professional_assignment_mutation_failure_telemetry
  WHERE assignment_link_id=telemetry_assignment_1 AND failure_code='INVALID_OPERATION';
  v_event_id_retry:=public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_1,'UNKNOWN',NULL,'INVALID_OPERATION');
  IF v_event_id IS NULL OR v_event_id_retry IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'Telemetry retry did not return the existing idempotent event';
  END IF;
  SELECT count(*) INTO v_telemetry_count
  FROM public.ils_professional_assignment_mutation_failure_telemetry
  WHERE failure_code='INVALID_OPERATION' AND source_type='SERVER_VERIFIED_MUTATION';
  IF v_telemetry_count<>3 THEN RAISE EXCEPTION 'Telemetry retry created a duplicate event'; END IF;
  BEGIN
    PERFORM public.ils_professional_assignment_evaluate_mutation_alerts(5);
    RAISE EXCEPTION 'ASSERT_EXPECTED_THRESHOLD_ACTION_CONFLICT';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err NOT LIKE 'MUTATION_ALERT_THRESHOLD_ACTION_CONFLICT:%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.ils_professional_assignment_mutation_alert_escalations
            WHERE source_failure_code='INVALID_OPERATION') THEN
    RAISE EXCEPTION 'Conflicting threshold created an escalation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ils_professional_assignment_security_review_queue
            WHERE source_failure_code='INVALID_OPERATION') THEN
    RAISE EXCEPTION 'Conflicting threshold created a review queue';
  END IF;

  -- REVIEW threshold creates a pending queue, not a mutation-channel action.
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_1,'ACTIVATE','ACTIVE','CROSS_USER_ASSIGNMENT');
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_2,'ACTIVATE','ACTIVE','CROSS_USER_ASSIGNMENT');

  -- A legacy row for another professional must not influence the subject
  -- attached to a threshold decision; aggregation and subject attribution
  -- must both use SERVER_VERIFIED_MUTATION events only.
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry
    (professional_user_id,failure_code,failure_class,safe_message,source_gate,
     source_type,occurred_at)
  VALUES(target_professional_id,'CROSS_USER_ASSIGNMENT','LEGACY',
         'Historical untrusted event.','LEGACY_IMPORT',
         'LEGACY_UNTRUSTED',clock_timestamp());

  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one REVIEW evaluation, got %',v_count; END IF;
  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='REVIEW' AND source_failure_code='CROSS_USER_ASSIGNMENT' AND review_status='PENDING';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending REVIEW queue'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.ils_professional_assignment_security_review_queue
    WHERE decision='REVIEW' AND source_failure_code='CROSS_USER_ASSIGNMENT'
      AND affected_professional_user_id=actor
  ) THEN
    RAISE EXCEPTION 'Legacy untrusted telemetry influenced review subject attribution';
  END IF;

  -- The assignment can still proceed while a REVIEW item is pending.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_commit(assignment_id,'ACTIVATE','ACTIVE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Assignment mutation failed while only REVIEW is pending';
  END IF;
  SELECT link_status INTO v_status FROM public.ils_professional_work_assignment_links WHERE id=assignment_id;
  IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Assignment did not activate while REVIEW is pending'; END IF;

  -- Crossing STOP creates an escalation/queue for human approval only.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_3,'ACTIVATE','ACTIVE','CROSS_USER_ASSIGNMENT');
  PERFORM public.ils_professional_assignment_record_trusted_mutation_failure(
    actor,telemetry_assignment_4,'ACTIVATE','ACTIVE','CROSS_USER_ASSIGNMENT');
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one STOP evaluation, got %',v_count; END IF;

  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='STOP' AND source_failure_code='CROSS_USER_ASSIGNMENT'
    AND review_status='PENDING' AND required_approval_level='HUMAN';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending STOP human-review queue'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.ils_professional_assignment_security_review_queue
    WHERE decision='STOP' AND source_failure_code='CROSS_USER_ASSIGNMENT'
      AND affected_professional_user_id=actor
  ) THEN RAISE EXCEPTION 'Affected professional identity was not bound to review queue'; END IF;
  SELECT id INTO v_stop_queue_id
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='STOP' AND source_failure_code='CROSS_USER_ASSIGNMENT'
    AND affected_professional_user_id=actor;
  IF v_stop_queue_id IS NULL THEN RAISE EXCEPTION 'Canonical STOP queue not found'; END IF;

  -- The affected professional is independently authorized as a reviewer,
  -- but must still be prevented from approving their own assignment action.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_security_review_decide(
       v_stop_queue_id,
       'APPROVE','FREEZE_MUTATION_CHANNEL','Self approval attempt') THEN
    RAISE EXCEPTION 'Affected professional was allowed to self-approve';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.ils_professional_assignment_security_review_queue
    WHERE decision='STOP' AND source_failure_code='CROSS_USER_ASSIGNMENT'
      AND review_status='PENDING'
  ) THEN RAISE EXCEPTION 'Self-approval attempt changed review status'; END IF;

  -- Null decisions are invalid, not an implicit rejection.
  IF public.ils_professional_security_review_decide(
       v_stop_queue_id,
       NULL,'FREEZE_MUTATION_CHANNEL','Null decision attempt') THEN
    RAISE EXCEPTION 'Null approval decision was accepted';
  END IF;

  -- An otherwise valid reviewer cannot expand the approved action beyond
  -- the exact action recorded on the escalation.
  PERFORM set_config('request.jwt.claim.sub',v_reviewer_id::text,true);
  IF public.ils_professional_security_review_decide(
       v_stop_queue_id,
       'APPROVE','CREATE_SECURITY_REVIEW','Action substitution attempt') THEN
    RAISE EXCEPTION 'Reviewer action substitution was accepted';
  END IF;

  -- Queue and escalation must agree on subject and source, not merely share
  -- a decision label. A deliberately mismatched pair must remain pending.
  INSERT INTO public.ils_professional_assignment_mutation_alert_escalations
    (id,decision,action_code,severity,source_failure_code,observed_count,status,
     human_approval_required,destructive_action_executed,affected_professional_user_id)
  VALUES(mismatch_escalation_id,'STOP','FREEZE_MUTATION_CHANNEL','CRITICAL',
         'DIFFERENT_SOURCE',4,'PENDING_REVIEW',true,false,v_reviewer_id);
  INSERT INTO public.ils_professional_assignment_security_review_queue
    (id,escalation_id,decision,severity,source_failure_code,observed_count,
     review_status,required_approval_level,affected_professional_user_id)
  VALUES(mismatch_queue_id,mismatch_escalation_id,'STOP','CRITICAL',
         'CROSS_USER_ASSIGNMENT',4,'PENDING','HUMAN',actor);
  IF public.ils_professional_security_review_decide(
       mismatch_queue_id,'APPROVE','FREEZE_MUTATION_CHANNEL','Mismatched escalation') THEN
    RAISE EXCEPTION 'Mismatched queue/escalation identity was approved';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_assignment_security_review_queue
                WHERE id=mismatch_queue_id AND review_status='PENDING') THEN
    RAISE EXCEPTION 'Mismatched queue changed state';
  END IF;

  -- A different active, verified, trained reviewer may approve the exact
  -- configured non-destructive proposal; the audit must retain the subject.
  PERFORM set_config('request.jwt.claim.sub',v_reviewer_id::text,true);
  IF public.ils_professional_security_review_decide(
       v_stop_queue_id,
       'APPROVE','FREEZE_MUTATION_CHANNEL','Independent security review') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Independent authorized reviewer could not approve exact action';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.ils_professional_assignment_security_review_approval_log
    WHERE reviewer_id=v_reviewer_id
      AND affected_professional_user_id=actor
      AND approval_decision='APPROVE'
      AND approved_action='FREEZE_MUTATION_CHANNEL'
  ) THEN RAISE EXCEPTION 'Approval audit omitted affected professional identity'; END IF;

  SELECT id INTO v_approval_log_id
  FROM public.ils_professional_assignment_security_review_approval_log
  WHERE reviewer_id=v_reviewer_id
    AND queue_id=v_stop_queue_id
    AND approval_decision='APPROVE';
  IF v_approval_log_id IS NULL THEN RAISE EXCEPTION 'Approval audit row missing'; END IF;
  IF has_table_privilege('service_role',
       'public.ils_professional_assignment_security_review_approval_log','UPDATE')
     OR has_table_privilege('service_role',
       'public.ils_professional_assignment_security_review_approval_log','DELETE')
     OR has_table_privilege('service_role',
       'public.ils_professional_assignment_security_review_approval_log','TRUNCATE') THEN
    RAISE EXCEPTION 'service_role can mutate append-only approval audit';
  END IF;
  BEGIN
    UPDATE public.ils_professional_assignment_security_review_approval_log
    SET approval_reason='tampered' WHERE id=v_approval_log_id;
    RAISE EXCEPTION 'ASSERT_EXPECTED_APPEND_ONLY_UPDATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEW_APPROVAL_LOG_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.ils_professional_assignment_security_review_approval_log
    WHERE id=v_approval_log_id;
    RAISE EXCEPTION 'ASSERT_EXPECTED_APPEND_ONLY_DELETE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEW_APPROVAL_LOG_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE public.ils_professional_assignment_security_review_approval_log;
    RAISE EXCEPTION 'ASSERT_EXPECTED_APPEND_ONLY_TRUNCATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEW_APPROVAL_LOG_APPEND_ONLY' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_assignment_security_review_approval_log
                WHERE id=v_approval_log_id) THEN
    RAISE EXCEPTION 'Approval audit row was not preserved after mutation attempts';
  END IF;

  -- Unknown/ambiguous subject identity must never be approved.
  INSERT INTO public.ils_professional_assignment_mutation_alert_escalations
    (id,decision,action_code,severity,source_failure_code,observed_count,status,
     human_approval_required,destructive_action_executed,affected_professional_user_id)
  VALUES(ambiguous_escalation_id,'STOP','FREEZE_MUTATION_CHANNEL','CRITICAL',
         'AMBIGUOUS_SUBJECT',4,'PENDING_REVIEW',true,false,NULL);
  INSERT INTO public.ils_professional_assignment_security_review_queue
    (id,escalation_id,decision,severity,source_failure_code,observed_count,
     review_status,required_approval_level,affected_professional_user_id)
  VALUES(ambiguous_queue_id,ambiguous_escalation_id,'STOP','CRITICAL',
         'AMBIGUOUS_SUBJECT',4,'PENDING','HUMAN',NULL);
  IF public.ils_professional_security_review_decide(
       ambiguous_queue_id,'APPROVE','FREEZE_MUTATION_CHANNEL','Ambiguous subject') THEN
    RAISE EXCEPTION 'Approval with unknown subject identity was allowed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_assignment_security_review_queue
                WHERE id=ambiguous_queue_id AND review_status='PENDING') THEN
    RAISE EXCEPTION 'Ambiguous-subject approval attempt changed queue state';
  END IF;

  SELECT count(*) INTO v_escalations
  FROM public.ils_professional_assignment_mutation_alert_escalations
  WHERE decision='STOP' AND action_code='FREEZE_MUTATION_CHANNEL'
    AND source_failure_code='CROSS_USER_ASSIGNMENT'
    AND status='ACKNOWLEDGED'
    AND human_approval_required=true
    AND destructive_action_executed=false;
  IF v_escalations<>1 THEN RAISE EXCEPTION 'Approved STOP must be acknowledged but not auto-executed'; END IF;

  IF to_regclass('public.ils_professional_assignment_mutation_channel_control') IS NOT NULL THEN
    RAISE EXCEPTION 'This alert evaluator must not create or auto-freeze a mutation channel';
  END IF;

  -- STOP has not been approved/executed, so it must not silently block or
  -- change an assignment. Restore the affected professional's test identity;
  -- the prior reviewer call deliberately switched the JWT subject.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_commit(assignment_id,'PAUSE','PAUSED') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pending STOP unexpectedly froze assignment mutation';
  END IF;
  SELECT link_status INTO v_status FROM public.ils_professional_work_assignment_links WHERE id=assignment_id;
  IF v_status<>'PAUSED' THEN RAISE EXCEPTION 'Pending STOP unexpectedly altered assignment mutation behavior'; END IF;

  -- Re-evaluation reuses the same open escalation and queue.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.ils_professional_assignment_evaluate_mutation_alerts(15);
  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE source_failure_code='CROSS_USER_ASSIGNMENT' AND id<>mismatch_queue_id;
  IF v_queues<>2 THEN RAISE EXCEPTION 'Repeated evaluation duplicated a review queue'; END IF;
  SELECT count(*) INTO v_escalations
  FROM public.ils_professional_assignment_mutation_alert_escalations
  WHERE source_failure_code='CROSS_USER_ASSIGNMENT' AND status IN ('PENDING_REVIEW','ACKNOWLEDGED');
  IF v_escalations<>2 THEN RAISE EXCEPTION 'Repeated evaluation duplicated an open escalation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_assignment_mutation_alert_escalations
                WHERE source_failure_code='CROSS_USER_ASSIGNMENT' AND decision='STOP'
                  AND status='ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'Reviewed escalation was not acknowledged';
  END IF;

  -- Telemetry is append-only even for privileged API roles.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  BEGIN
    UPDATE public.ils_professional_assignment_mutation_failure_telemetry
    SET safe_message='tampered'
    WHERE failure_code='CROSS_USER_ASSIGNMENT';
    RAISE EXCEPTION 'ASSERT_EXPECTED_TELEMETRY_UPDATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'ASSIGNMENT_FAILURE_TELEMETRY_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.ils_professional_assignment_mutation_failure_telemetry
    WHERE failure_code='CROSS_USER_ASSIGNMENT';
    RAISE EXCEPTION 'ASSERT_EXPECTED_TELEMETRY_DELETE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'ASSIGNMENT_FAILURE_TELEMETRY_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE public.ils_professional_assignment_mutation_failure_telemetry;
    RAISE EXCEPTION 'ASSERT_EXPECTED_TELEMETRY_TRUNCATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'ASSIGNMENT_FAILURE_TELEMETRY_APPEND_ONLY' THEN RAISE; END IF;
  END;

  -- Authenticated callers cannot execute the internal evaluator.
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
    PERFORM public.ils_professional_assignment_evaluate_mutation_alerts(15);
    RAISE EXCEPTION 'ASSERT_EXPECTED_SERVICE_ROLE_REQUIRED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'MUTATION_ALERT_EVALUATOR_SERVICE_ROLE_REQUIRED' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
