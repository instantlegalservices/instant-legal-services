-- Disposable PostgreSQL fixture for approval-binding runtime contract tests.
-- Mirrors the TEST catalog contract; never apply this file to Supabase.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE TABLE public.ils_professional_security_reviewer_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  reviewer_role text NOT NULL,
  authorization_status text NOT NULL CHECK (authorization_status IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')),
  identity_verified boolean NOT NULL DEFAULT false,
  security_training_verified boolean NOT NULL DEFAULT false,
  assigned_by uuid,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ils_professional_assignment_security_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid UNIQUE,
  decision text NOT NULL CHECK (decision IN ('REVIEW','STOP')),
  severity text NOT NULL CHECK (severity IN ('MEDIUM','HIGH','CRITICAL')),
  source_failure_code text,
  observed_count bigint,
  review_status text NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','CLOSED')),
  required_approval_level text NOT NULL DEFAULT 'HUMAN',
  assigned_reviewer_id uuid,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE public.ils_professional_assignment_security_review_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  reviewer_id uuid,
  approval_decision text NOT NULL CHECK (approval_decision IN ('APPROVE','REJECT')),
  approved_action text,
  approval_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ils_professional_assignment_mutation_alert_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision text NOT NULL CHECK (decision IN ('REVIEW','STOP')),
  action_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('MEDIUM','HIGH','CRITICAL')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  destructive_action_allowed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision,action_code)
);

CREATE TABLE public.ils_professional_security_approval_execution_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL UNIQUE,
  approval_log_id uuid NOT NULL UNIQUE,
  approved_action text NOT NULL,
  execution_status text NOT NULL DEFAULT 'PENDING'
    CHECK (execution_status IN ('PENDING','READY','EXECUTED','BLOCKED','CANCELLED')),
  bound_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  expires_at timestamptz DEFAULT (now()+interval '15 minutes'),
  execution_nonce text,
  approval_snapshot_hash text
);
CREATE UNIQUE INDEX ils_security_execution_fixture_nonce_uq
  ON public.ils_professional_security_approval_execution_bindings(execution_nonce)
  WHERE execution_nonce IS NOT NULL;

ALTER TABLE public.ils_professional_assignment_security_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_security_review_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_security_review_approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_security_review_approval_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_mutation_alert_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_assignment_mutation_alert_escalation_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_security_approval_execution_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_security_approval_execution_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_security_reviewer_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_security_reviewer_authorizations FORCE ROW LEVEL SECURITY;

GRANT ALL ON public.ils_professional_assignment_security_review_queue TO service_role;
GRANT ALL ON public.ils_professional_assignment_security_review_approval_log TO service_role;
GRANT ALL ON public.ils_professional_assignment_mutation_alert_escalation_rules TO service_role;
GRANT ALL ON public.ils_professional_security_approval_execution_bindings TO service_role;
GRANT ALL ON public.ils_professional_security_reviewer_authorizations TO service_role;

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
  b_id uuid;
  snap text;
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
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until >= now())
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_BINDING_REVIEWER_NOT_AUTHORIZED';
  END IF;

  PERFORM 1
  FROM public.ils_professional_assignment_mutation_alert_escalation_rules
  WHERE decision = q.decision
    AND action_code = p_approved_action
    AND active = true
    AND destructive_action_allowed = false;
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
    r.updated_at::text), 'sha256'), 'hex');

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
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until >= now())
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
    r.updated_at::text), 'sha256'), 'hex');

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
