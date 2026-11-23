-- TEST-only assignment mutation freeze guard.
-- The channel lock is acquired before assignment-row locks. A freeze waits for
-- in-flight commits; once committed, later commits observe FROZEN.
CREATE TABLE IF NOT EXISTS public.ils_professional_assignment_mutation_channel_control (
  channel_key text PRIMARY KEY CHECK (channel_key = 'PROFESSIONAL_ASSIGNMENT'),
  channel_state text NOT NULL CHECK (channel_state IN ('ACTIVE','FROZEN')),
  freeze_reason text,
  source_failure_code text,
  source_escalation_id uuid,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (channel_state='ACTIVE' AND freeze_reason IS NULL AND source_failure_code IS NULL)
    OR
    (channel_state='FROZEN' AND freeze_reason IS NOT NULL AND source_failure_code IS NOT NULL)
  )
);

INSERT INTO public.ils_professional_assignment_mutation_channel_control
  (channel_key,channel_state)
VALUES ('PROFESSIONAL_ASSIGNMENT','ACTIVE')
ON CONFLICT (channel_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ils_professional_assignment_mutation_channel_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_key text NOT NULL CHECK (channel_key='PROFESSIONAL_ASSIGNMENT'),
  from_state text NOT NULL CHECK (from_state IN ('ACTIVE','FROZEN')),
  to_state text NOT NULL CHECK (to_state IN ('ACTIVE','FROZEN')),
  action_code text NOT NULL,
  source_failure_code text,
  source_escalation_id uuid,
  reason text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('SYSTEM_THRESHOLD','SECURITY_ADMIN')),
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_state <> to_state)
);

ALTER TABLE public.ils_professional_assignment_mutation_channel_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_mutation_channel_control FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_mutation_channel_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_mutation_channel_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ils_professional_assignment_mutation_channel_control FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.ils_professional_assignment_mutation_channel_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ils_professional_assignment_mutation_channel_control TO service_role;
GRANT SELECT ON public.ils_professional_assignment_mutation_channel_control TO authenticated,service_role;
GRANT SELECT,INSERT ON public.ils_professional_assignment_mutation_channel_audit TO service_role;

CREATE POLICY ils_assignment_channel_state_read
ON public.ils_professional_assignment_mutation_channel_control
FOR SELECT TO authenticated USING (true);
CREATE POLICY ils_assignment_channel_state_service_write
ON public.ils_professional_assignment_mutation_channel_control
FOR ALL USING (auth.role()='service_role')
WITH CHECK (auth.role()='service_role');
CREATE POLICY ils_assignment_channel_audit_service_write
ON public.ils_professional_assignment_mutation_channel_audit
FOR INSERT WITH CHECK (auth.role()='service_role');

CREATE UNIQUE INDEX IF NOT EXISTS ils_professional_assignment_open_escalation_uq
ON public.ils_professional_assignment_mutation_alert_escalations
  (decision,action_code,source_failure_code)
WHERE status IN ('PENDING_REVIEW','ACKNOWLEDGED');

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_gate(
  p_assignment_link_id uuid,
  p_operation text,
  p_to_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record;
  v_channel_state text;
BEGIN
  IF auth.uid() IS NULL
     OR p_assignment_link_id IS NULL
     OR p_operation NOT IN ('ACTIVATE','PAUSE','REVOKE','COMPLETE') THEN
    RETURN false;
  END IF;

  -- Lock the channel first. This is the linearization point shared with freeze.
  SELECT c.channel_state INTO v_channel_state
  FROM public.ils_professional_assignment_mutation_channel_control c
  WHERE c.channel_key='PROFESSIONAL_ASSIGNMENT'
  FOR SHARE;

  -- Missing control row is fail-closed.
  IF NOT FOUND OR v_channel_state <> 'ACTIVE' THEN
    RETURN false;
  END IF;

  SELECT l.id,l.work_item_id,l.work_stream,l.professional_user_id,l.link_status
  INTO v
  FROM public.ils_professional_work_assignment_links l
  WHERE l.id=p_assignment_link_id
    AND l.professional_user_id=auth.uid();

  IF NOT FOUND THEN RETURN false; END IF;
  IF p_operation='ACTIVATE' AND p_to_status IS DISTINCT FROM 'ACTIVE' THEN RETURN false; END IF;
  IF p_operation='PAUSE' AND p_to_status IS DISTINCT FROM 'PAUSED' THEN RETURN false; END IF;
  IF p_operation='REVOKE' AND p_to_status IS DISTINCT FROM 'REVOKED' THEN RETURN false; END IF;
  IF p_operation='COMPLETE' AND p_to_status IS DISTINCT FROM 'COMPLETED' THEN RETURN false; END IF;
  IF NOT public.ils_professional_assignment_transition_allowed(v.link_status,p_to_status) THEN RETURN false; END IF;
  IF p_operation='ACTIVATE'
     AND NOT public.ils_professional_assignment_is_current(v.work_item_id,v.work_stream,v.professional_user_id) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;

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
  v_eval_id uuid;
  v_escalation_id uuid;
  v_action_code text;
  v_count integer:=0;
  v_old_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'MUTATION_ALERT_EVALUATOR_SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes <= 0 OR p_window_minutes > 1440 THEN
    RAISE EXCEPTION 'MUTATION_ALERT_WINDOW_INVALID';
  END IF;

  -- Serialize evaluator runs and share the same lock order as mutation commits.
  SELECT channel_state INTO v_old_state
  FROM public.ils_professional_assignment_mutation_channel_control
  WHERE channel_key='PROFESSIONAL_ASSIGNMENT'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MUTATION_CHANNEL_CONTROL_MISSING';
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
    -- The current config uses STOP_MUTATION_CHANNEL for stop-capable classes.
    -- REVIEW always opens a human queue. A REVIEW-only class reaching STOP is
    -- a configuration conflict and must not silently freeze the channel.
    IF r.decision='REVIEW' THEN
      v_action_code:='CREATE_SECURITY_REVIEW';
    ELSIF r.decision='STOP' AND r.action='STOP_MUTATION_CHANNEL' THEN
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
      (r.failure_code,r.window_minutes,r.observed_count::integer,r.decision,r.threshold_type)
    RETURNING id INTO v_eval_id;

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

    IF r.decision='STOP' THEN
      UPDATE public.ils_professional_assignment_mutation_channel_control
      SET channel_state='FROZEN',
          freeze_reason='STOP_THRESHOLD:'||r.failure_code,
          source_failure_code=r.failure_code,
          source_escalation_id=v_escalation_id,
          changed_at=clock_timestamp()
      WHERE channel_key='PROFESSIONAL_ASSIGNMENT'
        AND channel_state='ACTIVE';

      IF FOUND THEN
        INSERT INTO public.ils_professional_assignment_mutation_channel_audit
          (channel_key,from_state,to_state,action_code,source_failure_code,
           source_escalation_id,reason,actor_kind)
        VALUES
          ('PROFESSIONAL_ASSIGNMENT','ACTIVE','FROZEN','FREEZE_MUTATION_CHANNEL',
           r.failure_code,v_escalation_id,
           'Automatic fail-closed hold after configured STOP threshold',
           'SYSTEM_THRESHOLD');
      END IF;
    END IF;

    v_count:=v_count+1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Preserve the Action 615 internal-RPC lockdown: callers must use a
-- separately reviewed authenticated wrapper, not invoke this internal gate.
REVOKE ALL ON FUNCTION public.ils_professional_assignment_mutation_gate(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_mutation_gate(uuid,text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_evaluate_mutation_alerts(integer)
  TO service_role;
