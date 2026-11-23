-- Runtime tests for scoped assignment mutation freeze. All synthetic writes
-- are inside a transaction and rolled back.
BEGIN;
DO $test$
DECLARE
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assignment_id uuid:=gen_random_uuid();
  v_state text;
  v_count integer;
  v_status text;
  v_queues integer;
  v_audit integer;
  err text;
BEGIN
  -- Authenticated clients must not execute the internal gate/commit RPCs.
  -- The disposable test connection is the database owner for behavioral
  -- assertions below; these privilege checks independently verify the grants.
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

  -- A REVIEW-only threshold that escalates to STOP is a configuration
  -- contradiction. It must raise and must not freeze or create an escalation.
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
  SELECT channel_state INTO v_state
  FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT';
  IF v_state<>'ACTIVE' THEN RAISE EXCEPTION 'Conflicting REVIEW-only threshold froze channel'; END IF;
  IF EXISTS(SELECT 1 FROM public.ils_professional_assignment_mutation_alert_escalations
            WHERE source_failure_code='INVALID_OPERATION') THEN
    RAISE EXCEPTION 'Conflicting threshold created an escalation';
  END IF;

  -- At REVIEW threshold: create a review queue, do not freeze.
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
  SELECT 'AUTH_REQUIRED' FROM generate_series(1,2);
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one REVIEW evaluation, got %',v_count; END IF;
  SELECT channel_state INTO v_state
  FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT';
  IF v_state<>'ACTIVE' THEN RAISE EXCEPTION 'REVIEW threshold froze assignment channel'; END IF;
  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='REVIEW' AND source_failure_code='AUTH_REQUIRED' AND review_status='PENDING';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending REVIEW queue'; END IF;

  -- Existing assignment workflow remains operational before STOP threshold.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_commit(assignment_id,'ACTIVATE','ACTIVE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Assignment mutation failed while channel ACTIVE';
  END IF;
  SELECT link_status INTO v_status FROM public.ils_professional_work_assignment_links WHERE id=assignment_id;
  IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Assignment status did not update while ACTIVE'; END IF;

  -- Crossing STOP threshold freezes only this channel.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry(failure_code)
  SELECT 'AUTH_REQUIRED' FROM generate_series(1,2);
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one STOP evaluation, got %',v_count; END IF;

  SELECT channel_state INTO v_state
  FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT';
  IF v_state<>'FROZEN' THEN RAISE EXCEPTION 'STOP threshold did not freeze assignment channel'; END IF;

  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='STOP' AND source_failure_code='AUTH_REQUIRED' AND review_status='PENDING';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending STOP review queue'; END IF;

  SELECT count(*) INTO v_audit
  FROM public.ils_professional_assignment_mutation_channel_audit
  WHERE from_state='ACTIVE' AND to_state='FROZEN' AND action_code='FREEZE_MUTATION_CHANNEL';
  IF v_audit<>1 THEN RAISE EXCEPTION 'Expected exactly one freeze audit event'; END IF;

  -- A frozen assignment channel rejects the next mutation without changing
  -- assignment state or writing an ALLOW audit/event.
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_commit(assignment_id,'PAUSE','PAUSED') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Frozen channel accepted assignment mutation';
  END IF;
  SELECT link_status INTO v_status FROM public.ils_professional_work_assignment_links WHERE id=assignment_id;
  IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Frozen channel changed assignment state'; END IF;
  IF (SELECT count(*) FROM public.ils_professional_assignment_mutation_audit WHERE assignment_link_id=assignment_id AND decision='ALLOW')<>1 THEN
    RAISE EXCEPTION 'Frozen mutation wrote an unexpected ALLOW audit';
  END IF;

  -- Re-running the evaluator is idempotent for open escalation/queue/freeze.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF (SELECT count(*) FROM public.ils_professional_assignment_security_review_queue
      WHERE source_failure_code='AUTH_REQUIRED')<>2 THEN
    RAISE EXCEPTION 'Repeated evaluation duplicated a review queue';
  END IF;
  IF (SELECT count(*) FROM public.ils_professional_assignment_mutation_channel_audit
      WHERE action_code='FREEZE_MUTATION_CHANNEL')<>1 THEN
    RAISE EXCEPTION 'Repeated evaluation duplicated freeze audit';
  END IF;

  -- Missing channel control row is fail-closed.
  DELETE FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT';
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_commit(assignment_id,'PAUSE','PAUSED') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Missing control row did not fail closed';
  END IF;

  -- Evaluator rejects authenticated non-service callers.
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
