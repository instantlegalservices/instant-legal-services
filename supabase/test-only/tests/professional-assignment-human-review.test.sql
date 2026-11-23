-- Runtime tests for human-reviewed assignment mutation escalations.
-- STOP creates a pending review item only; no automatic freeze or mutation.
BEGIN;
DO $test$
DECLARE
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assignment_id uuid:=gen_random_uuid();
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
    ('AUTH_REQUIRED',15,2,4,'STOP_MUTATION_CHANNEL',true),
    ('INVALID_OPERATION',5,2,3,'REVIEW',true);

  INSERT INTO public.ils_professional_assignment_mutation_alert_escalation_rules
    (decision,action_code,severity,requires_human_approval,destructive_action_allowed,active)
  VALUES
    ('REVIEW','CREATE_SECURITY_REVIEW','MEDIUM',true,false,true),
    ('STOP','FREEZE_MUTATION_CHANNEL','CRITICAL',true,false,true);

  INSERT INTO public.ils_professional_work_assignment_links
    (id,work_item_id,work_stream,professional_user_id,link_status)
  VALUES(assignment_id,gen_random_uuid(),'LEGAL',actor,'PENDING');

  -- A REVIEW-only threshold reaching STOP is a configuration contradiction.
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
  SELECT 'INVALID_OPERATION' FROM generate_series(1,3);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
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
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
  SELECT 'AUTH_REQUIRED' FROM generate_series(1,2);
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one REVIEW evaluation, got %',v_count; END IF;
  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='REVIEW' AND source_failure_code='AUTH_REQUIRED' AND review_status='PENDING';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending REVIEW queue'; END IF;

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
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
  SELECT 'AUTH_REQUIRED' FROM generate_series(1,2);
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one STOP evaluation, got %',v_count; END IF;

  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='STOP' AND source_failure_code='AUTH_REQUIRED'
    AND review_status='PENDING' AND required_approval_level='HUMAN';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending STOP human-review queue'; END IF;

  SELECT count(*) INTO v_escalations
  FROM public.ils_professional_assignment_mutation_alert_escalations
  WHERE decision='STOP' AND action_code='FREEZE_MUTATION_CHANNEL'
    AND source_failure_code='AUTH_REQUIRED'
    AND status='PENDING_REVIEW'
    AND human_approval_required=true
    AND destructive_action_executed=false;
  IF v_escalations<>1 THEN RAISE EXCEPTION 'STOP must remain a pending human-approved proposal'; END IF;

  IF to_regclass('public.ils_professional_assignment_mutation_channel_control') IS NOT NULL THEN
    RAISE EXCEPTION 'This alert evaluator must not create or auto-freeze a mutation channel';
  END IF;

  -- STOP has not been approved/executed, so it must not silently block or
  -- change an assignment. A separate approved-action executor is still absent.
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
  WHERE source_failure_code='AUTH_REQUIRED';
  IF v_queues<>2 THEN RAISE EXCEPTION 'Repeated evaluation duplicated a review queue'; END IF;
  SELECT count(*) INTO v_escalations
  FROM public.ils_professional_assignment_mutation_alert_escalations
  WHERE source_failure_code='AUTH_REQUIRED' AND status='PENDING_REVIEW';
  IF v_escalations<>2 THEN RAISE EXCEPTION 'Repeated evaluation duplicated an open escalation'; END IF;

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
