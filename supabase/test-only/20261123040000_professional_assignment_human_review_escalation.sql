-- TEST-only Professional Assignment alert escalation.
-- STOP is a proposed action requiring human approval; this evaluator never
-- freezes or mutates the assignment channel. Execution needs a separately
-- reviewed approval-bound executor, which is not currently wired.

-- Carry the affected professional identity from trusted telemetry into the
-- immutable review decision context. NULL means ambiguous/unknown and must
-- fail closed for approvals.
ALTER TABLE public.ils_professional_assignment_mutation_alert_escalations
  ADD COLUMN IF NOT EXISTS affected_professional_user_id uuid;
ALTER TABLE public.ils_professional_assignment_security_review_queue
  ADD COLUMN IF NOT EXISTS affected_professional_user_id uuid;
ALTER TABLE public.ils_professional_assignment_security_review_approval_log
  ADD COLUMN IF NOT EXISTS affected_professional_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ils_professional_assignment_open_escalation_uq
ON public.ils_professional_assignment_mutation_alert_escalations
  (decision,action_code,source_failure_code)
WHERE status IN ('PENDING_REVIEW','ACKNOWLEDGED');

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(
  p_window_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_rule record;
  v_escalation_id uuid;
  v_action_code text;
  v_subject uuid;
  v_subject_count integer;
  v_null_subject_count integer;
  v_count integer:=0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'MUTATION_ALERT_EVALUATOR_SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes <= 0 OR p_window_minutes > 1440 THEN
    RAISE EXCEPTION 'MUTATION_ALERT_WINDOW_INVALID';
  END IF;

  FOR r IN
    SELECT a.failure_code,a.window_minutes,a.review_threshold,a.stop_threshold,
           a.action,x.observed_count,x.decision,x.threshold_type
    FROM public.ils_professional_assignment_mutation_alert_thresholds a
    JOIN public.ils_professional_assignment_mutation_telemetry_aggregate(p_window_minutes) x
      ON x.failure_code=a.failure_code
    WHERE a.active=true
      AND a.window_minutes=p_window_minutes
      AND x.decision IN ('REVIEW','STOP')
  LOOP
    IF r.decision='REVIEW' THEN
      v_action_code:='CREATE_SECURITY_REVIEW';
    ELSIF r.decision='STOP' AND r.action='STOP_MUTATION_CHANNEL' THEN
      -- Queue the proposed freeze action for an authorized reviewer.
      -- Do not execute it while the queue is pending.
      v_action_code:='FREEZE_MUTATION_CHANNEL';
    ELSE
      RAISE EXCEPTION 'MUTATION_ALERT_THRESHOLD_ACTION_CONFLICT:%:%',
        r.failure_code,r.action;
    END IF;

    SELECT * INTO v_rule
    FROM public.ils_professional_assignment_mutation_alert_escalation_rules er
    WHERE er.decision=r.decision
      AND er.action_code=v_action_code
      AND er.active=true
      AND er.requires_human_approval=true
      AND er.destructive_action_allowed=false
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MUTATION_ALERT_ESCALATION_RULE_MISSING:%:%',
        r.decision,v_action_code;
    END IF;

    -- Only bind a subject when every event in the threshold window has the
    -- same non-null professional identity. Mixed/anonymous events stay
    -- unapprovable instead of guessing which professional is affected.
    SELECT count(DISTINCT e.professional_user_id),
           count(*) FILTER (WHERE e.professional_user_id IS NULL),
           min(e.professional_user_id::text)::uuid
      INTO v_subject_count,v_null_subject_count,v_subject
    FROM public.ils_professional_assignment_mutation_failure_telemetry e
    WHERE e.failure_code=r.failure_code
      AND e.occurred_at>=clock_timestamp()-make_interval(mins=>p_window_minutes);

    IF v_subject_count<>1 OR v_null_subject_count>0 THEN
      v_subject:=NULL;
    END IF;

    INSERT INTO public.ils_professional_assignment_mutation_alert_evaluations
      (failure_code,window_minutes,observed_count,decision,threshold_type)
    VALUES
      (r.failure_code,r.window_minutes,r.observed_count::integer,r.decision,r.threshold_type);

    INSERT INTO public.ils_professional_assignment_mutation_alert_decision_log
      (failure_code,window_minutes,observed_count,review_threshold,stop_threshold,decision,threshold_type)
    VALUES
      (r.failure_code,r.window_minutes,r.observed_count,r.review_threshold,r.stop_threshold,r.decision,r.threshold_type);

    PERFORM pg_advisory_xact_lock(hashtext(r.failure_code),hashtext(r.decision||':'||v_action_code));

    INSERT INTO public.ils_professional_assignment_mutation_alert_escalations
      (decision,action_code,severity,source_failure_code,observed_count,status,
       human_approval_required,destructive_action_executed,affected_professional_user_id)
    VALUES
      (r.decision,v_action_code,v_rule.severity,r.failure_code,r.observed_count,
       'PENDING_REVIEW',true,false,v_subject)
    ON CONFLICT (decision,action_code,source_failure_code)
      WHERE status IN ('PENDING_REVIEW','ACKNOWLEDGED')
    DO UPDATE SET
      observed_count=GREATEST(
        public.ils_professional_assignment_mutation_alert_escalations.observed_count,
        EXCLUDED.observed_count
      ),
      affected_professional_user_id=CASE
        WHEN public.ils_professional_assignment_mutation_alert_escalations.affected_professional_user_id
             IS NOT DISTINCT FROM EXCLUDED.affected_professional_user_id
        THEN public.ils_professional_assignment_mutation_alert_escalations.affected_professional_user_id
        ELSE NULL
      END
    RETURNING id,affected_professional_user_id INTO v_escalation_id,v_subject;

    INSERT INTO public.ils_professional_assignment_security_review_queue
      (escalation_id,decision,severity,source_failure_code,observed_count,
       review_status,required_approval_level,affected_professional_user_id)
    VALUES
      (v_escalation_id,r.decision,v_rule.severity,r.failure_code,r.observed_count,
       'PENDING','HUMAN',v_subject)
    ON CONFLICT (escalation_id) DO UPDATE SET
      affected_professional_user_id=CASE
        WHEN public.ils_professional_assignment_security_review_queue.affected_professional_user_id
             IS NOT DISTINCT FROM EXCLUDED.affected_professional_user_id
        THEN public.ils_professional_assignment_security_review_queue.affected_professional_user_id
        ELSE NULL
      END;

    -- Intentionally no channel freeze or assignment mutation here.
    v_count:=v_count+1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Enforce the original Action 489 no-self-approval rule and preserve the
-- subject identity in the approval audit. If subject identity is missing or
-- ambiguous, approval is denied; rejection remains available to an authorized
-- reviewer. Lock the reviewer authorization row during the decision.
CREATE OR REPLACE FUNCTION public.ils_professional_security_review_decide(
  p_queue_id uuid,
  p_approval_decision text,
  p_approved_action text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  q record;
  reviewer record;
  u uuid;
BEGIN
  u:=auth.uid();
  IF u IS NULL OR p_queue_id IS NULL
     OR p_approval_decision NOT IN ('APPROVE','REJECT')
     OR p_reason IS NULL OR length(trim(p_reason))<5 THEN
    RETURN false;
  END IF;

  SELECT * INTO reviewer
  FROM public.ils_professional_security_reviewer_authorizations r
  WHERE r.user_id=u
    AND r.authorization_status='ACTIVE'
    AND r.reviewer_role IN ('SECURITY_REVIEWER','SECURITY_ADMIN')
    AND r.identity_verified=true
    AND r.security_training_verified=true
    AND (r.valid_from IS NULL OR r.valid_from<=clock_timestamp())
    AND (r.valid_until IS NULL OR r.valid_until>=clock_timestamp())
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO q
  FROM public.ils_professional_assignment_security_review_queue
  WHERE id=p_queue_id
  FOR UPDATE;
  IF NOT FOUND OR q.review_status NOT IN ('PENDING','IN_REVIEW') THEN
    RETURN false;
  END IF;
  IF q.assigned_reviewer_id IS NOT NULL AND q.assigned_reviewer_id<>u THEN
    RETURN false;
  END IF;
  IF q.source_failure_code IS NULL OR q.decision IS NULL THEN
    RETURN false;
  END IF;

  IF p_approval_decision='APPROVE' THEN
    -- Unknown/ambiguous subject or self-approval is a hard denial.
    IF q.affected_professional_user_id IS NULL
       OR q.affected_professional_user_id=u THEN
      RETURN false;
    END IF;
    IF p_approved_action IS NULL OR NOT EXISTS(
      SELECT 1
      FROM public.ils_professional_assignment_mutation_alert_escalation_rules r
      WHERE r.decision=q.decision
        AND r.action_code=p_approved_action
        AND r.active=true
        AND r.requires_human_approval=true
        AND r.destructive_action_allowed=false
    ) THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.ils_professional_assignment_security_review_queue
  SET review_status=CASE WHEN p_approval_decision='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
      assigned_reviewer_id=u,
      reviewer_note=trim(p_reason),
      reviewed_at=clock_timestamp()
  WHERE id=p_queue_id;

  INSERT INTO public.ils_professional_assignment_security_review_approval_log
    (queue_id,reviewer_id,approval_decision,approved_action,approval_reason,
     affected_professional_user_id)
  VALUES
    (q.id,u,p_approval_decision,p_approved_action,trim(p_reason),
     q.affected_professional_user_id);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.ils_professional_security_review_decide(uuid,text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ils_professional_security_review_decide(uuid,text,text,text)
  TO authenticated;
