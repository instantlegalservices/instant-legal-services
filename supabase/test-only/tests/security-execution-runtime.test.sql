-- Runtime tests execute TEST-only hardened approval binding and consume
-- functions against disposable synthetic identities. Outer ROLLBACK removes all rows.
BEGIN;
DO $test$
DECLARE
  q_pending uuid:=gen_random_uuid();
  q1 uuid:=gen_random_uuid();
  q2 uuid:=gen_random_uuid();
  q3 uuid:=gen_random_uuid();
  q4 uuid:=gen_random_uuid();
  q5 uuid:=gen_random_uuid();
  q6 uuid:=gen_random_uuid();
  q7 uuid:=gen_random_uuid();
  q8 uuid:=gen_random_uuid();
  q9 uuid:=gen_random_uuid();
  q10 uuid:=gen_random_uuid();
  a1 uuid:=gen_random_uuid();
  a2 uuid:=gen_random_uuid();
  a3 uuid:=gen_random_uuid();
  a4 uuid:=gen_random_uuid();
  a5 uuid:=gen_random_uuid();
  a6 uuid:=gen_random_uuid();
  a7 uuid:=gen_random_uuid();
  a8 uuid:=gen_random_uuid();
  a9 uuid:=gen_random_uuid();
  a10 uuid:=gen_random_uuid();
  r1 uuid:=gen_random_uuid();
  r2 uuid:=gen_random_uuid();
  r3 uuid:=gen_random_uuid();
  r4 uuid:=gen_random_uuid();
  r5 uuid:=gen_random_uuid();
  r6 uuid:=gen_random_uuid();
  r7 uuid:=gen_random_uuid();
  r8 uuid:=gen_random_uuid();
  r9 uuid:=gen_random_uuid();
  r10 uuid:=gen_random_uuid();
  b1 uuid;
  b4 uuid;
  b5 uuid;
  b7 uuid;
  b8 uuid;
  b10 uuid;
  snap1 text;
  snap4 text;
  snap5 text;
  snap7 text;
  snap8 text;
  snap10 text;
  err text;
  consumed boolean;
  bind_definition text;
  consume_definition text;
BEGIN
  bind_definition:=pg_get_functiondef(
    'public.ils_professional_security_approval_execution_bind(uuid,uuid,text,text,integer)'::regprocedure
  );
  consume_definition:=pg_get_functiondef(
    'public.ils_professional_security_approval_execution_consume(uuid,text,text,text)'::regprocedure
  );

  IF position('FOR SHARE' in bind_definition)=0
     OR position('EXECUTION_BINDING_REVIEWER_NOT_AUTHORIZED' in bind_definition)=0
     OR position('rule_rec.id::text' in bind_definition)=0
     OR position('q.assigned_reviewer_id IS DISTINCT FROM a.reviewer_id' in bind_definition)=0
     OR position('r.valid_until < clock_timestamp()' in bind_definition)=0
     OR position('r.valid_until < clock_timestamp()' in bind_definition) < position('FOR SHARE' in bind_definition)
     OR position('r.valid_until < clock_timestamp()' in bind_definition) < position('FROM public.ils_professional_assignment_mutation_alert_escalation_rules' in bind_definition)
     OR position('FOR SHARE' in substring(bind_definition from position('FROM public.ils_professional_assignment_mutation_alert_escalation_rules' in bind_definition)))=0
     OR position('v_authorized_at' in bind_definition)>0 THEN
    RAISE EXCEPTION 'Bind function does not lock and validate reviewer authorization';
  END IF;
  IF position('FOR SHARE' in consume_definition)=0
     OR position('SET execution_status = ''BLOCKED''' in consume_definition)=0
     OR position('RETURN false' in consume_definition)=0
     OR position('clock_timestamp() >= b.expires_at' in consume_definition)=0
     OR position('rule_rec.id::text' in consume_definition)=0
     OR position('r.valid_until < clock_timestamp()' in consume_definition)=0
     OR position('r.valid_until < clock_timestamp()' in consume_definition) < position('FOR SHARE' in consume_definition)
     OR position('r.valid_until < clock_timestamp()' in consume_definition) < position('FROM public.ils_professional_assignment_mutation_alert_escalation_rules' in consume_definition)
     OR position('FOR SHARE' in substring(consume_definition from position('FROM public.ils_professional_assignment_mutation_alert_escalation_rules' in consume_definition)))=0
     OR position('v_authorized_at' in consume_definition)>0 THEN
    RAISE EXCEPTION 'Consume function does not revalidate reviewer and persist blocked state';
  END IF;

  INSERT INTO public.ils_professional_assignment_mutation_alert_escalation_rules
    (decision,action_code,severity,requires_human_approval,destructive_action_allowed,active)
  VALUES('REVIEW','CREATE_SECURITY_REVIEW','MEDIUM',true,false,true);

  INSERT INTO public.ils_professional_security_reviewer_authorizations
    (user_id,reviewer_role,authorization_status,identity_verified,security_training_verified,valid_from,updated_at)
  VALUES
    (r1,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now()),
    (r2,'SECURITY_ADMIN','ACTIVE',true,true,now()-interval '1 day',now()),
    (r3,'SECURITY_REVIEWER','REVOKED',true,true,now()-interval '1 day',now()),
    (r4,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now()),
    (r5,'SECURITY_ADMIN','ACTIVE',true,true,now()-interval '1 day',now()),
    (r6,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now()),
    (r7,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now()),
    (r8,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now()),
    (r9,'SECURITY_REVIEWER','ACTIVE',true,true,clock_timestamp()+interval '0.15 second',now()),
    (r10,'SECURITY_REVIEWER','ACTIVE',true,true,now()-interval '1 day',now());

  INSERT INTO public.ils_professional_assignment_security_review_queue
    (id,decision,severity,review_status,source_failure_code,assigned_reviewer_id)
  VALUES
    (q_pending,'REVIEW','MEDIUM','PENDING','CI_PENDING',r1),
    (q1,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_ONE',r1),
    (q2,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_TWO',r2),
    (q3,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_THREE',r3),
    (q4,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_FOUR',r4),
    (q5,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_FIVE',r5),
    (q6,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_SIX',r6),
    (q7,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_SEVEN',r7),
    (q8,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_EIGHT',r8),
    (q9,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_NINE',r9),
    (q10,'REVIEW','MEDIUM','APPROVED','CI_REVIEW_TEN',r10);

  INSERT INTO public.ils_professional_assignment_security_review_approval_log
    (id,queue_id,reviewer_id,approval_decision,approved_action,approval_reason)
  VALUES
    (a1,q1,r1,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval one'),
    (a2,q2,r2,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval two'),
    (a3,q3,r3,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval revoked reviewer'),
    (a4,q4,r4,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval four'),
    (a5,q5,r5,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval five'),
    (a6,q6,r6,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval six'),
    (a7,q7,r7,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval seven'),
    (a8,q8,r8,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI approval eight'),
    (a9,q9,r9,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI future-start reviewer'),
    (a10,q10,r10,'APPROVE','CREATE_SECURITY_REVIEW','Disposable CI expiring reviewer');

  -- Pending review cannot be bound.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q_pending,gen_random_uuid(),'CREATE_SECURITY_REVIEW','nonce-pending-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_APPROVAL_NOT_READY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_APPROVAL_NOT_READY' THEN RAISE; END IF;
  END;

  -- A valid active reviewer can create a binding.
  b1:=public.ils_professional_security_approval_execution_bind(
    q1,a1,'CREATE_SECURITY_REVIEW','nonce-replay-ci',15
  );
  SELECT approval_snapshot_hash INTO snap1
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b1;

  -- Reusing the nonce on a second approved queue is rejected.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q2,a2,'CREATE_SECURITY_REVIEW','nonce-replay-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_NONCE_REPLAY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_NONCE_REPLAY' THEN RAISE; END IF;
  END;

  -- Revoked reviewer cannot bind an approval that was made earlier.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q3,a3,'CREATE_SECURITY_REVIEW','nonce-revoked-before-bind',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_REVOKED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_REVIEWER_NOT_AUTHORIZED' THEN RAISE; END IF;
  END;

  -- Tampered approval snapshot is rejected.
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_consume(
      b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',repeat('0',64)
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_SNAPSHOT_MISMATCH';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_CONSUME_SNAPSHOT_MISMATCH' THEN RAISE; END IF;
  END;

  -- Expiry persists BLOCKED (does not raise and roll the update back).
  UPDATE public.ils_professional_security_approval_execution_bindings
  SET expires_at=now()-interval '1 minute' WHERE id=b1;
  consumed:=public.ils_professional_security_approval_execution_consume(
    b1,'nonce-replay-ci','CREATE_SECURITY_REVIEW',snap1
  );
  IF consumed IS DISTINCT FROM false OR
     (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b1)<>'BLOCKED' THEN
    RAISE EXCEPTION 'Expired binding did not persist BLOCKED';
  END IF;

  -- Reviewer authorization revoked after bind is rechecked at consume and
  -- causes a persisted BLOCKED result rather than execution.
  b4:=public.ils_professional_security_approval_execution_bind(
    q4,a4,'CREATE_SECURITY_REVIEW','nonce-reviewer-revoked-after-bind',15
  );
  SELECT approval_snapshot_hash INTO snap4
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b4;
  UPDATE public.ils_professional_security_reviewer_authorizations
  SET authorization_status='SUSPENDED',updated_at=now()
  WHERE user_id=r4;
  consumed:=public.ils_professional_security_approval_execution_consume(
    b4,'nonce-reviewer-revoked-after-bind','CREATE_SECURITY_REVIEW',snap4
  );
  IF consumed IS DISTINCT FROM false OR
     (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b4)<>'BLOCKED' THEN
    RAISE EXCEPTION 'Reviewer revocation after bind did not persist BLOCKED';
  END IF;

  -- A separate valid approval still consumes exactly once.
  b5:=public.ils_professional_security_approval_execution_bind(
    q5,a5,'CREATE_SECURITY_REVIEW','nonce-valid-ci',15
  );
  SELECT approval_snapshot_hash INTO snap5
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b5;
  IF public.ils_professional_security_approval_execution_consume(
    b5,'nonce-valid-ci','CREATE_SECURITY_REVIEW',snap5
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Valid one-time consume did not succeed';
  END IF;
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_consume(
      b5,'nonce-valid-ci','CREATE_SECURITY_REVIEW',snap5
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_CONSUME_REPLAY';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_CONSUME_NOT_READY' THEN RAISE; END IF;
  END;

  -- Destructive actions remain prohibited even with a valid reviewer.
  UPDATE public.ils_professional_assignment_mutation_alert_escalation_rules
  SET destructive_action_allowed=true
  WHERE decision='REVIEW' AND action_code='CREATE_SECURITY_REVIEW';
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q6,a6,'CREATE_SECURITY_REVIEW','nonce-destructive-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_ACTION_NOT_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;

  -- A policy change after bind must block consumption; the policy row is
  -- locked during consume so a concurrent policy change cannot race execution.
  UPDATE public.ils_professional_assignment_mutation_alert_escalation_rules
  SET destructive_action_allowed=false
  WHERE decision='REVIEW' AND action_code='CREATE_SECURITY_REVIEW';
  b7:=public.ils_professional_security_approval_execution_bind(
    q7,a7,'CREATE_SECURITY_REVIEW','nonce-policy-change-ci',15
  );
  SELECT approval_snapshot_hash INTO snap7
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b7;
  UPDATE public.ils_professional_assignment_mutation_alert_escalation_rules
  SET destructive_action_allowed=true
  WHERE decision='REVIEW' AND action_code='CREATE_SECURITY_REVIEW';
  consumed:=public.ils_professional_security_approval_execution_consume(
    b7,'nonce-policy-change-ci','CREATE_SECURITY_REVIEW',snap7
  );
  IF consumed IS DISTINCT FROM false OR
     (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b7)<>'BLOCKED' THEN
    RAISE EXCEPTION 'Changed action policy did not persist BLOCKED';
  END IF;

  -- now() is fixed at transaction start. A binding expiring while this
  -- transaction is already open must still be rejected using wall-clock time.
  UPDATE public.ils_professional_assignment_mutation_alert_escalation_rules
  SET destructive_action_allowed=false
  WHERE decision='REVIEW' AND action_code='CREATE_SECURITY_REVIEW';
  b8:=public.ils_professional_security_approval_execution_bind(
    q8,a8,'CREATE_SECURITY_REVIEW','nonce-wall-clock-expiry-ci',15
  );
  SELECT approval_snapshot_hash INTO snap8
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b8;
  UPDATE public.ils_professional_security_approval_execution_bindings
  SET expires_at=clock_timestamp()+interval '0.1 second' WHERE id=b8;
  PERFORM pg_sleep(0.2);
  consumed:=public.ils_professional_security_approval_execution_consume(
    b8,'nonce-wall-clock-expiry-ci','CREATE_SECURITY_REVIEW',snap8
  );
  IF consumed IS DISTINCT FROM false OR
     (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b8)<>'BLOCKED' THEN
    RAISE EXCEPTION 'Binding that expired during the open transaction was not blocked';
  END IF;

  -- Reviewer valid_from is still in the future at bind time, while transaction-
  -- start now() predates it. The stale transaction timestamp must not authorize
  -- a reviewer whose wall-clock validity has not started yet.
  UPDATE public.ils_professional_security_reviewer_authorizations
  SET valid_from=clock_timestamp()+interval '0.5 second'
  WHERE user_id=r9;
  BEGIN
    PERFORM public.ils_professional_security_approval_execution_bind(
      q9,a9,'CREATE_SECURITY_REVIEW','nonce-reviewer-not-yet-valid-ci',15
    );
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_NOT_YET_VALID';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'EXECUTION_BINDING_REVIEWER_NOT_AUTHORIZED' THEN RAISE; END IF;
  END;

  -- Reviewer valid_until expires after bind while this outer transaction is
  -- still open. Consume must use wall-clock time and persist BLOCKED.
  UPDATE public.ils_professional_security_reviewer_authorizations
  SET valid_until=clock_timestamp()+interval '0.15 second'
  WHERE user_id=r10;
  b10:=public.ils_professional_security_approval_execution_bind(
    q10,a10,'CREATE_SECURITY_REVIEW','nonce-reviewer-validity-expiry-ci',15
  );
  SELECT approval_snapshot_hash INTO snap10
  FROM public.ils_professional_security_approval_execution_bindings WHERE id=b10;
  PERFORM pg_sleep(0.2);
  consumed:=public.ils_professional_security_approval_execution_consume(
    b10,'nonce-reviewer-validity-expiry-ci','CREATE_SECURITY_REVIEW',snap10
  );
  IF consumed IS DISTINCT FROM false OR
     (SELECT execution_status FROM public.ils_professional_security_approval_execution_bindings WHERE id=b10)<>'BLOCKED' THEN
    RAISE EXCEPTION 'Reviewer validity expiry during open transaction was not blocked';
  END IF;

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
