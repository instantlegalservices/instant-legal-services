-- TEST-only Professional Assignment alert escalation.
-- STOP is a proposed action requiring human approval; this evaluator never
-- freezes or mutates the assignment channel. Execution needs a separately
-- reviewed approval-bound executor, which is not currently wired.
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
       human_approval_required,destructive_action_executed)
    VALUES
      (r.decision,v_action_code,v_rule.severity,r.failure_code,r.observed_count,
       'PENDING_REVIEW',true,false)
    ON CONFLICT (decision,action_code,source_failure_code)
      WHERE status IN ('PENDING_REVIEW','ACKNOWLEDGED')
    DO UPDATE SET observed_count=GREATEST(
      public.ils_professional_assignment_mutation_alert_escalations.observed_count,
      EXCLUDED.observed_count
    )
    RETURNING id INTO v_escalation_id;

    INSERT INTO public.ils_professional_assignment_security_review_queue
      (escalation_id,decision,severity,source_failure_code,observed_count,
       review_status,required_approval_level)
    VALUES
      (v_escalation_id,r.decision,v_rule.severity,r.failure_code,r.observed_count,
       'PENDING','HUMAN')
    ON CONFLICT (escalation_id) DO NOTHING;

    -- Intentionally no channel freeze or assignment mutation here.
    v_count:=v_count+1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  TO service_role;
