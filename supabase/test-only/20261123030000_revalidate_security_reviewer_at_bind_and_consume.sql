-- TEST-only security hardening. Revalidate the reviewer identity and
-- authorization at both bind and consume, and bind that authorization state
-- into the approval snapshot. Never apply to live TEST/Production without review.
CREATE OR REPLACE FUNCTION public.ils_professional_security_approval_execution_bind(p_queue_id uuid, p_approval_log_id uuid, p_approved_action text, p_execution_nonce text, p_ttl_minutes integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  a record;
  r record;
  rule_rec record;
  b_id uuid;
  snap text;
  v_authorized_at timestamptz := clock_timestamp();
BEGIN
  IF p_queue_id IS NULL OR p_approval_log_id IS NULL
     OR nullif(trim(p_approved_action),'') IS NULL
     OR nullif(trim(p_execution_nonce),'') IS NULL THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_INVALID_INPUT';
  END IF;
  IF p_ttl_minutes < 1 OR p_ttl_minutes > 60 THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_INVALID_TTL';
  END IF;

  SELECT * INTO q
  FROM public.ils_professional_assignment_security_review_queue
  WHERE id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND OR q.review_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_APPROVAL_NOT_READY';
  END IF;

  SELECT * INTO a
  FROM public.ils_professional_assignment_security_review_approval_log
  WHERE id = p_approval_log_id AND queue_id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND OR a.approval_decision <> 'APPROVE'
     OR a.approved_action <> p_approved_action
     OR a.reviewer_id IS NULL
     OR q.assigned_reviewer_id IS DISTINCT FROM a.reviewer_id THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_ACTION_MISMATCH';
  END IF;

  SELECT * INTO r
  FROM public.ils_professional_security_reviewer_authorizations
  WHERE user_id = a.reviewer_id
    AND authorization_status = 'ACTIVE'
    AND reviewer_role IN ('SECURITY_REVIEWER','SECURITY_ADMIN')
    AND identity_verified = true
    AND security_training_verified = true
    AND (valid_from IS NULL OR valid_from <= v_authorized_at)
    AND (valid_until IS NULL OR valid_until >= v_authorized_at)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_REVIEWER_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO rule_rec
  FROM public.ils_professional_assignment_mutation_alert_escalation_rules
  WHERE decision = q.decision
    AND action_code = p_approved_action
    AND active = true
    AND requires_human_approval = true
    AND destructive_action_allowed = false
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_ACTION_NOT_ALLOWED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ils_professional_security_approval_execution_bindings
    WHERE queue_id = p_queue_id
  ) THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_ALREADY_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ils_professional_security_approval_execution_bindings
    WHERE execution_nonce = p_execution_nonce
  ) THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_NONCE_REPLAY';
  END IF;

  snap := encode(digest(concat_ws('|',
    q.id::text, q.review_status, q.decision, q.source_failure_code,
    q.assigned_reviewer_id::text,
    a.id::text, a.reviewer_id::text, a.approval_decision,
    a.approved_action, coalesce(a.approval_reason,''),
    r.reviewer_role, r.authorization_status,
    r.identity_verified::text, r.security_training_verified::text,
    coalesce(r.valid_from::text,''), coalesce(r.valid_until::text,''),
    r.updated_at::text,
    rule_rec.id::text, rule_rec.severity, rule_rec.requires_human_approval::text,
    rule_rec.destructive_action_allowed::text, rule_rec.active::text), 'sha256'), 'hex');

  INSERT INTO public.ils_professional_security_approval_execution_bindings
    (queue_id, approval_log_id, approved_action, execution_status,
     bound_at, expires_at, execution_nonce, approval_snapshot_hash)
  VALUES
    (q.id, a.id, p_approved_action, 'READY', now(),
     now() + (p_ttl_minutes || ' minutes')::interval,
     p_execution_nonce, snap)
  RETURNING id INTO b_id;

  RETURN b_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ils_professional_security_approval_execution_consume(p_binding_id uuid, p_execution_nonce text, p_expected_action text, p_approval_snapshot_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record;
  q record;
  a record;
  r record;
  rule_rec record;
  snap text;
  did_execute boolean := false;
  v_authorized_at timestamptz := clock_timestamp();
BEGIN
  IF p_binding_id IS NULL
     OR nullif(trim(p_execution_nonce),'') IS NULL
     OR nullif(trim(p_expected_action),'') IS NULL
     OR nullif(trim(p_approval_snapshot_hash),'') IS NULL THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_INVALID_INPUT';
  END IF;

  SELECT * INTO b
  FROM public.ils_professional_security_approval_execution_bindings
  WHERE id = p_binding_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_BINDING_NOT_FOUND';
  END IF;
  IF b.execution_status <> 'READY' THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_NOT_READY';
  END IF;
  IF b.execution_nonce <> p_execution_nonce THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_NONCE_MISMATCH';
  END IF;
  IF b.approved_action <> p_expected_action THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_ACTION_MISMATCH';
  END IF;
  IF b.expires_at IS NULL OR clock_timestamp() >= b.expires_at THEN
    UPDATE public.ils_professional_security_approval_execution_bindings
    SET execution_status = 'BLOCKED'
    WHERE id = b.id AND execution_status = 'READY';
    RETURN false;
  END IF;

  SELECT * INTO q
  FROM public.ils_professional_assignment_security_review_queue
  WHERE id = b.queue_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_APPROVAL_DRIFT';
  END IF;

  SELECT * INTO a
  FROM public.ils_professional_assignment_security_review_approval_log
  WHERE id = b.approval_log_id AND queue_id = b.queue_id
  FOR UPDATE;
  IF NOT FOUND OR q.review_status <> 'APPROVED'
     OR a.approval_decision <> 'APPROVE'
     OR a.approved_action <> b.approved_action
     OR a.reviewer_id IS NULL
     OR q.assigned_reviewer_id IS DISTINCT FROM a.reviewer_id THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_APPROVAL_DRIFT';
  END IF;

  SELECT * INTO r
  FROM public.ils_professional_security_reviewer_authorizations
  WHERE user_id = a.reviewer_id
    AND authorization_status = 'ACTIVE'
    AND reviewer_role IN ('SECURITY_REVIEWER','SECURITY_ADMIN')
    AND identity_verified = true
    AND security_training_verified = true
    AND (valid_from IS NULL OR valid_from <= v_authorized_at)
    AND (valid_until IS NULL OR valid_until >= v_authorized_at)
  FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.ils_professional_security_approval_execution_bindings
    SET execution_status = 'BLOCKED'
    WHERE id = b.id AND execution_status = 'READY';
    RETURN false;
  END IF;

  SELECT * INTO rule_rec
  FROM public.ils_professional_assignment_mutation_alert_escalation_rules
  WHERE decision = q.decision
    AND action_code = b.approved_action
    AND active = true
    AND requires_human_approval = true
    AND destructive_action_allowed = false
  FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.ils_professional_security_approval_execution_bindings
    SET execution_status = 'BLOCKED'
    WHERE id = b.id AND execution_status = 'READY';
    RETURN false;
  END IF;

  snap := encode(digest(concat_ws('|',
    q.id::text, q.review_status, q.decision, q.source_failure_code,
    q.assigned_reviewer_id::text,
    a.id::text, a.reviewer_id::text, a.approval_decision,
    a.approved_action, coalesce(a.approval_reason,''),
    r.reviewer_role, r.authorization_status,
    r.identity_verified::text, r.security_training_verified::text,
    coalesce(r.valid_from::text,''), coalesce(r.valid_until::text,''),
    r.updated_at::text,
    rule_rec.id::text, rule_rec.severity, rule_rec.requires_human_approval::text,
    rule_rec.destructive_action_allowed::text, rule_rec.active::text), 'sha256'), 'hex');

  IF snap <> b.approval_snapshot_hash OR snap <> p_approval_snapshot_hash THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_SNAPSHOT_MISMATCH';
  END IF;

  UPDATE public.ils_professional_security_approval_execution_bindings
  SET execution_status = 'EXECUTED', executed_at = now()
  WHERE id = b.id AND execution_status = 'READY'
  RETURNING true INTO did_execute;

  IF NOT did_execute THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_REPLAY';
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_security_approval_execution_bind(uuid,uuid,text,text,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ils_professional_security_approval_execution_consume(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_security_approval_execution_bind(uuid,uuid,text,text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ils_professional_security_approval_execution_consume(uuid,text,text,text)
  TO service_role;
