-- Runtime tests call the actual approval-binding/consume function contracts
-- against disposable synthetic rows. The outer ROLLBACK removes every fixture.
BEGIN;
DO $test$
DECLARE
  q_pending uuid:=gen_random_uuid();
  q1 uuid:=gen_random_uuid();
  q2 uuid:=gen_random_uuid();
  q3 uuid:=gen_random_uuid();
  a1 uuid:=gen_random_uuid();
  a2 uuid:=gen_random_uuid();
  a3 uuid:=gen_random_uuid();
  b1 uuid;
  snap text;
  err text;
BEGIN
  INSERT INTO public.ils_professional_assignment_mutation_alert_escalation_rules
    (decision,action_code,severity,requires_human_approval,destructive_action_allowed,active)
  VALUES('REVIEW','CREATE_SECURITY_REVIEW','MEDIUM',true,false,true);

  -- Approval-not-ready must reject before a binding can be created.
  INSERT INTO public.ils_professional_assignment_security_review_queue(id,decision,severity,review_status,source_failure_code)
  VALUES(q_pending,'REVIEW','MEDIUM','PENDING','CI_PENDING');
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q_pending,gen_random_uuid(),'CREATE_SECURITY_REVIEW','nonce-pending',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_APPROVAL_NOT_READY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_APPROVAL_NOT_READY' THEN RAISE; END IF;
  END;

  -- Create two independently approved synthetic records.
  INSERT INTO public.ils_professional_assignment_security_review_queue
    (id,decision,severity,review_status,source_failure_code)
  VALUES
    (q1,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_ONE'),
    (q2,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_TWO'),
    (q3,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_THREE');
  INSERT INTO public.ils_professional_assignment_security_review_approval_log
    (id,queue_id,reviewer_id,approval_decision,approved_action,approval_reason)
  VALUES
    (a1,q1,gen_random_uuid(),'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval record one'),
    (a2,q2,gen_random_uuid(),'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval record two'),
    (a3,q3,gen_random_uuid(),'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval record three');

  b1:=public.ils_professional_security_approval_execution_bind(
    q1,a1,'CREATE_SECURITY_REVIEW','nonce-replay-ci',15
  );
  SELECT approval_snapshot_hash INTO snap
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b1;

  -- Reusing a nonce on a different queue must be blocked.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q2,a2,'CREATE_SECURITY_REVIEW','nonce-replay-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_NONCE_REPLAY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_NONCE_REPLAY' THEN RAISE; END IF;
  END;

  -- Tampered snapshot must be blocked.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_consume(
      b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',repeat('0',64)
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_SNAPSHOT_MISMATCH';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_CONSUME_SNAPSHOT_MISMATCH' THEN RAISE; END IF;
  END;

  -- Expired binding must be blocked. Nested exception block rolls back the
  -- consume function's intermediate BLOCKED update, proving no partial write.
  UPDATE public.ils_professional_security_approval_execution_bindings
  SET expires_at=now()-interval '1 minute' WHERE id=b1;
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_consume(
      b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',snap
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_EXPIRED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_CONSUME_EXPIRED' THEN RAISE; END IF;
  END;
  IF (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b1)<>'READY' THEN
    RAISE EXCEPTION 'Expired consume left a partial state change';
  END IF;

  -- Restore only the synthetic fixture to complete a valid one-time consume.
  UPDATE public.ils_professional_security_approval_execution_bindings
  SET expires_at=now()+interval '5 minutes' WHERE id=b1;
  IF public.ils_professional_security_approval_execution_consume(
    b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',snap
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Valid one-time consume did not succeed';
  END IF;

  -- A second consume is blocked because the binding is no longer READY.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_consume(
      b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',snap
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_CONSUME_REPLAY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_CONSUME_NOT_READY' THEN RAISE; END IF;
  END;

  -- Destructive rules must never produce an execution binding.
  UPDATE public.ils_professional_assignment_mutation_alert_escalation_rules
  SET destructive_action_allowed=true
  WHERE decision='REVIEW' AND action_code='CREATE_SECURITY_REVIEW';
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q3,a3,'CREATE_SECURITY_REVIEW','nonce-destructive-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_ACTION_NOT_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;

  -- Service-only privilege boundary is verified from effective grants.
  IF has_function_privilege('anon',
       'public.ils_professional_security_approval_execution_bind(uuid,uuid,text,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.ils_professional_security_approval_execution_bind(uuid,uuid,text,text,integer)','EXECUTE')
     OR has_function_privilege('anon',
       'public.ils_professional_security_approval_execution_consume(uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.ils_professional_security_approval_execution_consume(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Approval binding functions are exposed to untrusted roles';
  END IF;
END;
$test$;
ROLLBACK;
