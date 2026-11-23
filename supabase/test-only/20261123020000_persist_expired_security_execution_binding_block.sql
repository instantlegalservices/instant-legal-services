-- TEST-only hardening: preserve BLOCKED state for expired approval bindings.
-- Safe to apply only after review; never auto-applied to TEST or Production.
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
  snap text;
  did_execute boolean := false;
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
  IF b.expires_at IS NULL OR now() > b.expires_at THEN
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
     OR a.approved_action <> b.approved_action THEN
    RAISE EXCEPTION 'EXECUTION_CONSUME_APPROVAL_DRIFT';
  END IF;

  snap := encode(digest(concat_ws('|',
    q.id::text, q.review_status, q.decision, q.source_failure_code,
    a.id::text, a.approval_decision, a.approved_action,
    coalesce(a.approval_reason,'')), 'sha256'), 'hex');

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

REVOKE ALL ON FUNCTION public.ils_professional_security_approval_execution_consume(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_security_approval_execution_consume(uuid,text,text,text)
  TO service_role;
