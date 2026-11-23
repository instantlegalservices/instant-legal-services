-- Runtime tests for human-reviewed assignment mutation escalations.
-- STOP creates a pending review item only; no automatic freeze or mutation.
BEGIN;
DO $test$
DECLARE
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  target_professional_id uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_reviewer_id uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  new_reviewer_id uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  second_admin_id uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
  unverified_reviewer_id uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_admin_result jsonb;
  admin_definition text;
  v_admin_audit_count integer;
  assignment_id uuid:=gen_random_uuid();
  work_item_id uuid:=gen_random_uuid();
  assignment_decision_id uuid:=gen_random_uuid();
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
  admin_definition:=pg_get_functiondef(
    'public.ils_professional_security_reviewer_administer(uuid,text,text,text,text,timestamptz)'::regprocedure
  );
  IF position('v_now := clock_timestamp()' in admin_definition)=0
     OR position('v_now := clock_timestamp()' in admin_definition) < position('WHERE r.user_id=p_subject_user_id' in admin_definition)
     OR position('v_actor_auth.valid_until<v_now' in admin_definition) < position('v_now := clock_timestamp()' in admin_definition)
     OR position('v_actor_auth.valid_from>v_now' in admin_definition) < position('v_now := clock_timestamp()' in admin_definition)
     OR position('pg_advisory_xact_lock(hashtextextended(p_subject_user_id::text, 0))' in admin_definition)=0
     OR position('pg_advisory_xact_lock(hashtextextended(p_subject_user_id::text, 0))' in admin_definition) > position('WHERE r.user_id=p_subject_user_id' in admin_definition)
     OR position('v_now timestamptz:=' in admin_definition)>0 THEN
    RAISE EXCEPTION 'Reviewer administration must revalidate SECURITY_ADMIN validity after target locks';
  END IF;

  IF has_function_privilege('authenticated',
       'public.ils_professional_assignment_is_current(uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role unexpectedly has internal current-eligibility EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.ils_professional_assignment_is_current(uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lacks internal current-eligibility EXECUTE';
  END IF;

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

  INSERT INTO public.ils_associate_trust_profiles
    (user_id,associate_id,role_type,display_name,profile_status,
     identity_verified,qualification_verified,professional_registration_verified,capability_verified)
  VALUES
    (actor,'fixture-associate-001','ADVOCATE','Fixture Advocate','ACTIVE',true,true,true,true);

  INSERT INTO public.ils_professional_work_items
    (id,professional_user_id,matter_reference,client_brief,assigned_scope,checklist,self_qa,reviewer_qa)
  VALUES
    (work_item_id,actor,'FIXTURE-MATTER-001','{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb);

  INSERT INTO public.ils_unified_assignment_decisions
    (id,work_code,associate_user_id,selected_role_code,decision,reason_code,
     evidence_snapshot,requires_supervision,requires_professional_review)
  VALUES
    (assignment_decision_id,'FIXTURE-WORK-001',actor,'ADVOCATE','ALLOW',
     'VERIFIED_CAPABILITY','{}'::jsonb,false,false);

  INSERT INTO public.ils_professional_work_assignment_links
    (id,work_item_id,work_stream,assignment_decision_id,professional_user_id,link_status)
  VALUES
    (assignment_id,work_item_id,'PROFESSIONAL',assignment_decision_id,actor,'APPROVED'),
    (telemetry_assignment_1,gen_random_uuid(),'PROFESSIONAL',NULL,target_professional_id,'PENDING'),
    (telemetry_assignment_2,gen_random_uuid(),'PROFESSIONAL',NULL,target_professional_id,'PENDING'),
    (telemetry_assignment_3,gen_random_uuid(),'PROFESSIONAL',NULL,target_professional_id,'PENDING'),
    (telemetry_assignment_4,gen_random_uuid(),'PROFESSIONAL',NULL,target_professional_id,'PENDING');

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF NOT public.ils_professional_assignment_is_current(work_item_id,'PROFESSIONAL',actor) THEN
    RAISE EXCEPTION 'Synthetic approved assignment fixture does not satisfy live current-eligibility contract';
  END IF;
  IF public.ils_professional_assignment_is_current(work_item_id,'PROFESSIONAL',target_professional_id) THEN
    RAISE EXCEPTION 'Current-eligibility function accepted a different professional identity';
  END IF;

  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (actor,'security-admin-fixture@example.invalid',clock_timestamp()),
    (v_reviewer_id,'reviewer-fixture@example.invalid',clock_timestamp()),
    (new_reviewer_id,'new-reviewer-fixture@example.invalid',clock_timestamp()),
    (second_admin_id,'second-admin-fixture@example.invalid',clock_timestamp()),
    (unverified_reviewer_id,'unverified-reviewer-fixture@example.invalid',NULL);

  INSERT INTO public.ils_professional_security_reviewer_authorizations
    (user_id,reviewer_role,authorization_status,identity_verified,security_training_verified)
  VALUES
    (actor,'SECURITY_ADMIN','ACTIVE',true,true),
    (v_reviewer_id,'SECURITY_REVIEWER','ACTIVE',true,true),
    (second_admin_id,'SECURITY_ADMIN','ACTIVE',true,true);

  -- Only a different, active SECURITY_ADMIN may grant SECURITY_REVIEWER.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v_admin_result:=public.ils_professional_security_reviewer_administer(
    new_reviewer_id,'GRANT',
    'Identity and security training verified against internal case references.',
    'ILS-SEC-ID-TEST-0001','ILS-SEC-TRAIN-TEST-0001',
    clock_timestamp()+interval '90 days');
  IF v_admin_result->>'authorization_status'<>'ACTIVE'
     OR v_admin_result->>'reviewer_role'<>'SECURITY_REVIEWER' THEN
    RAISE EXCEPTION 'Reviewer provisioning did not return an active reviewer';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.ils_professional_security_reviewer_authorizations
    WHERE user_id=new_reviewer_id AND reviewer_role='SECURITY_REVIEWER'
      AND authorization_status='ACTIVE' AND identity_verified=true
      AND security_training_verified=true AND assigned_by=actor
      AND valid_until>clock_timestamp()
  ) THEN RAISE EXCEPTION 'Provisioned reviewer authorization row is incomplete'; END IF;

  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      actor,'GRANT','Attempted self-provisioning by the current administrator.',
      'ILS-SEC-ID-TEST-0002','ILS-SEC-TRAIN-TEST-0002',
      clock_timestamp()+interval '90 days');
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_SELF_ADMIN_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_SELF_ADMINISTRATION_BLOCKED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      unverified_reviewer_id,'GRANT',
      'Attempted grant to an unverified Auth identity.',
      'ILS-SEC-ID-TEST-0003','ILS-SEC-TRAIN-TEST-0003',
      clock_timestamp()+interval '90 days');
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_IDENTITY_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_TARGET_IDENTITY_UNVERIFIED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      new_reviewer_id,'GRANT',
      'Duplicate grant must not silently refresh an active reviewer.',
      'ILS-SEC-ID-TEST-0004','ILS-SEC-TRAIN-TEST-0004',
      clock_timestamp()+interval '90 days');
    RAISE EXCEPTION 'ASSERT_EXPECTED_DUPLICATE_REVIEWER_GRANT_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_ALREADY_ACTIVE' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      new_reviewer_id,NULL,'Null operation must be rejected.',
      'ILS-SEC-ID-TEST-0005','ILS-SEC-TRAIN-TEST-0005',
      clock_timestamp()+interval '90 days');
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_NULL_OPERATION_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_OPERATION_INVALID' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      second_admin_id,'SUSPEND','Security Admin role cannot be administered through reviewer RPC.');
    RAISE EXCEPTION 'ASSERT_EXPECTED_SECURITY_ADMIN_ROLE_CEILING';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_ADMIN_ROLE_REQUIRES_OWNER_BOOTSTRAP' THEN RAISE; END IF;
  END;

  -- An ordinary reviewer cannot administer another reviewer.
  PERFORM set_config('request.jwt.claim.sub',v_reviewer_id::text,true);
  BEGIN
    PERFORM public.ils_professional_security_reviewer_administer(
      new_reviewer_id,'SUSPEND','Unauthorized reviewer attempted to suspend another reviewer.');
    RAISE EXCEPTION 'ASSERT_EXPECTED_SECURITY_ADMIN_REQUIRED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_ADMIN_REQUIRED' THEN RAISE; END IF;
  END;

  -- The Security Admin may suspend and revoke; both transitions are audited.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM public.ils_professional_security_reviewer_administer(
    new_reviewer_id,'SUSPEND','Temporary suspension pending a scheduled security review.');
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_security_reviewer_authorizations
                WHERE user_id=new_reviewer_id AND authorization_status='SUSPENDED') THEN
    RAISE EXCEPTION 'Reviewer suspension did not persist';
  END IF;
  PERFORM public.ils_professional_security_reviewer_administer(
    new_reviewer_id,'REVOKE','Reviewer authorization revoked after independent review.');
  IF NOT EXISTS(SELECT 1 FROM public.ils_professional_security_reviewer_authorizations
                WHERE user_id=new_reviewer_id AND authorization_status='REVOKED') THEN
    RAISE EXCEPTION 'Reviewer revocation did not persist';
  END IF;
  SELECT count(*) INTO v_admin_audit_count
  FROM public.ils_professional_security_reviewer_admin_audit
  WHERE subject_user_id=new_reviewer_id AND actor_user_id=actor;
  IF v_admin_audit_count<>3 THEN
    RAISE EXCEPTION 'Expected grant/suspend/revoke audit entries, got %',v_admin_audit_count;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ils_professional_security_reviewer_admin_audit
            WHERE subject_user_id=new_reviewer_id AND reviewer_role<>'SECURITY_REVIEWER') THEN
    RAISE EXCEPTION 'Reviewer provisioning audit contains an elevated role';
  END IF;
  IF has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_authorizations','SELECT')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_authorizations','INSERT')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_authorizations','UPDATE')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_authorizations','DELETE')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_authorizations','TRUNCATE') THEN
    RAISE EXCEPTION 'service_role can bypass the reviewer provisioning function';
  END IF;
  IF has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_admin_audit','INSERT')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_admin_audit','UPDATE')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_admin_audit','DELETE')
     OR has_table_privilege('service_role',
       'public.ils_professional_security_reviewer_admin_audit','TRUNCATE') THEN
    RAISE EXCEPTION 'service_role can bypass reviewer administration audit';
  END IF;

  BEGIN
    UPDATE public.ils_professional_security_reviewer_admin_audit
    SET reason='tampered' WHERE subject_user_id=new_reviewer_id;
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_AUDIT_UPDATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_ADMIN_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.ils_professional_security_reviewer_admin_audit
    WHERE subject_user_id=new_reviewer_id;
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_AUDIT_DELETE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_ADMIN_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE public.ils_professional_security_reviewer_admin_audit;
    RAISE EXCEPTION 'ASSERT_EXPECTED_REVIEWER_AUDIT_TRUNCATE_BLOCK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err<>'SECURITY_REVIEWER_ADMIN_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;

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
  v_count:=public.ils_professional_assignment_evaluate_mutation_alerts(15);
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one REVIEW evaluation, got %',v_count; END IF;
  SELECT count(*) INTO v_queues
  FROM public.ils_professional_assignment_security_review_queue
  WHERE decision='REVIEW' AND source_failure_code='CROSS_USER_ASSIGNMENT' AND review_status='PENDING';
  IF v_queues<>1 THEN RAISE EXCEPTION 'Expected one pending REVIEW queue'; END IF;

  -- The assignment can still proceed while a REVIEW item is pending.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF public.ils_professional_assignment_mutation_request(assignment_id,'ACTIVATE','ACTIVE') IS DISTINCT FROM true THEN
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
  IF public.ils_professional_assignment_mutation_request(assignment_id,'PAUSE','PAUSED') IS DISTINCT FROM true THEN
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

-- Exercise the real SQL privilege boundary as the authenticated database role,
-- not merely by setting JWT claims while the test session remains postgres.
INSERT INTO public.ils_professional_work_assignment_links
  (id,work_item_id,work_stream,professional_user_id,link_status)
VALUES
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222','PROFESSIONAL',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','APPROVED'),
  ('33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444','PROFESSIONAL',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','APPROVED');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $authenticated_rpc$
BEGIN
  IF auth.uid() IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN
    RAISE EXCEPTION 'Authenticated JWT subject was not preserved after SET ROLE';
  END IF;
  IF NOT has_function_privilege(current_user,
       'public.ils_professional_assignment_mutation_request(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot execute the public mutation request';
  END IF;
  IF has_function_privilege(current_user,
       'public.ils_professional_assignment_mutation_commit(uuid,text,text)','EXECUTE')
     OR has_function_privilege(current_user,
       'public.ils_professional_assignment_mutation_gate(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role can execute an internal mutation RPC';
  END IF;

  IF public.ils_professional_assignment_mutation_request(
       '11111111-1111-4111-8111-111111111111','ACTIVATE','ACTIVE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Authenticated wrapper could not invoke the owner-checked internal mutation';
  END IF;

  IF public.ils_professional_assignment_mutation_request(
       '33333333-3333-4333-8333-333333333333','ACTIVATE','ACTIVE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Authenticated wrapper allowed cross-user assignment mutation';
  END IF;

  BEGIN
    PERFORM public.ils_professional_assignment_mutation_commit(
      '11111111-1111-4111-8111-111111111111','PAUSE','PAUSED');
    RAISE EXCEPTION 'ASSERT_EXPECTED_INTERNAL_RPC_PERMISSION_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$authenticated_rpc$;
RESET ROLE;

DO $verify_mutation$
BEGIN
  IF (SELECT link_status FROM public.ils_professional_work_assignment_links
      WHERE id='11111111-1111-4111-8111-111111111111') IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Authenticated wrapper mutation did not persist';
  END IF;
  IF (SELECT link_status FROM public.ils_professional_work_assignment_links
      WHERE id='33333333-3333-4333-8333-333333333333') IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'Cross-user mutation changed another professional assignment';
  END IF;
END;
$verify_mutation$;
ROLLBACK;
