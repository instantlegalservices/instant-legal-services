-- Disposable PostgreSQL fixture for assignment mutation freeze tests.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $;
-- Match Supabase's normal API-role access to auth.uid()/auth.role().
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon,authenticated,service_role;

CREATE TABLE public.ils_professional_assignment_mutation_failure_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_link_id uuid,
  work_item_id uuid,
  work_stream text,
  professional_user_id uuid,
  operation text,
  requested_status text,
  failure_code text NOT NULL,
  failure_class text NOT NULL,
  safe_message text NOT NULL,
  source_gate text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_type text NOT NULL DEFAULT 'LEGACY_UNTRUSTED',
  source_event_id uuid,
  actor_user_id uuid,
  producer_version text,
  dedupe_key text
);
CREATE TABLE public.ils_professional_assignment_mutation_alert_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_code text NOT NULL,
  window_minutes integer NOT NULL,
  review_threshold integer NOT NULL,
  stop_threshold integer NOT NULL,
  action text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(failure_code,window_minutes)
);
INSERT INTO public.ils_professional_assignment_mutation_alert_thresholds
  (failure_code,window_minutes,review_threshold,stop_threshold,action,active)
VALUES ('AUTH_REQUIRED',15,2,4,'STOP_MUTATION_CHANNEL',true);
CREATE TABLE public.ils_professional_assignment_mutation_alert_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_code text NOT NULL,
  window_minutes integer NOT NULL,
  observed_count integer NOT NULL,
  decision text NOT NULL,
  threshold_type text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_mutation_alert_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_code text NOT NULL,
  window_minutes integer NOT NULL,
  observed_count bigint NOT NULL,
  review_threshold integer NOT NULL,
  stop_threshold integer NOT NULL,
  decision text NOT NULL CHECK(decision IN ('NORMAL','REVIEW','STOP')),
  threshold_type text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_mutation_alert_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision text NOT NULL CHECK(decision IN ('REVIEW','STOP')),
  action_code text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('MEDIUM','HIGH','CRITICAL')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  destructive_action_allowed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision,action_code)
);
CREATE TABLE public.ils_professional_assignment_mutation_alert_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision text NOT NULL,
  action_code text NOT NULL,
  severity text NOT NULL,
  source_failure_code text,
  observed_count bigint,
  status text NOT NULL CHECK(status IN ('PENDING_REVIEW','ACKNOWLEDGED','CLOSED','BLOCKED')),
  human_approval_required boolean NOT NULL,
  destructive_action_executed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE public.ils_professional_assignment_security_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid UNIQUE,
  decision text NOT NULL CHECK(decision IN ('REVIEW','STOP')),
  severity text NOT NULL CHECK(severity IN ('MEDIUM','HIGH','CRITICAL')),
  source_failure_code text,
  observed_count bigint,
  review_status text NOT NULL DEFAULT 'PENDING'
    CHECK(review_status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','CLOSED')),
  required_approval_level text NOT NULL DEFAULT 'HUMAN',
  assigned_reviewer_id uuid,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE public.ils_professional_security_reviewer_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  reviewer_role text NOT NULL,
  authorization_status text NOT NULL,
  identity_verified boolean NOT NULL,
  security_training_verified boolean NOT NULL,
  assigned_by uuid,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_security_review_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  reviewer_id uuid,
  approval_decision text NOT NULL,
  approved_action text,
  approval_reason text NOT NULL,
  affected_professional_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ils_associate_trust_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  associate_id text NOT NULL,
  role_type text NOT NULL,
  display_name text NOT NULL,
  profile_status text NOT NULL DEFAULT 'PENDING',
  identity_verified boolean NOT NULL DEFAULT false,
  qualification_verified boolean NOT NULL DEFAULT false,
  professional_registration_verified boolean NOT NULL DEFAULT false,
  capability_verified boolean NOT NULL DEFAULT false
);
CREATE TABLE public.ils_professional_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id uuid NOT NULL,
  matter_reference text NOT NULL,
  client_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  self_qa jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_qa jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ASSIGNED',
  client_update_status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE public.ils_b2b_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id uuid
);
CREATE TABLE public.ils_unified_assignment_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_code text NOT NULL,
  associate_user_id uuid NOT NULL,
  selected_role_code text NOT NULL,
  decision text NOT NULL DEFAULT 'ELIGIBLE',
  reason_code text NOT NULL,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_supervision boolean NOT NULL DEFAULT true,
  requires_professional_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_work_assignment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL,
  work_stream text NOT NULL,
  assignment_decision_id uuid,
  work_code text,
  professional_user_id uuid NOT NULL,
  link_status text NOT NULL DEFAULT 'PENDING',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_mutation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_link_id uuid,
  work_item_id uuid,
  work_stream text,
  professional_user_id uuid,
  operation text NOT NULL,
  from_status text,
  to_status text,
  decision text NOT NULL,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_mutation_event_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_link_id uuid NOT NULL,
  work_item_id uuid NOT NULL,
  work_stream text NOT NULL,
  professional_user_id uuid NOT NULL,
  operation text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  decision text NOT NULL,
  reason_code text,
  event_hash text NOT NULL,
  previous_event_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_transition_allowed(p_from text,p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN p_from IS NULL AND p_to='PENDING' THEN true
    WHEN p_from='PENDING' AND p_to='APPROVED' THEN true
    WHEN p_from='APPROVED' AND p_to='ACTIVE' THEN true
    WHEN p_from='ACTIVE' AND p_to IN ('PAUSED','REVOKED','COMPLETED') THEN true
    WHEN p_from='PAUSED' AND p_to IN ('ACTIVE','REVOKED') THEN true
    WHEN p_from='REVOKED' AND p_to='PENDING' THEN false
    WHEN p_from='COMPLETED' AND p_to='ACTIVE' THEN false
    ELSE false
  END;
$function$;
CREATE OR REPLACE FUNCTION public.ils_professional_assignment_is_current(
  p_work_item_id uuid,p_work_stream text,p_professional_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR auth.uid()<>p_professional_user_id
      OR p_work_item_id IS NULL OR p_work_stream NOT IN ('PROFESSIONAL','B2B') THEN false
    WHEN NOT EXISTS(
      SELECT 1 FROM public.ils_associate_trust_profiles t
      WHERE t.user_id=p_professional_user_id AND t.profile_status='ACTIVE'
        AND t.identity_verified=true AND t.qualification_verified=true
        AND t.professional_registration_verified=true AND t.capability_verified=true
    ) THEN false
    WHEN p_work_stream='PROFESSIONAL' THEN EXISTS(
      SELECT 1
      FROM public.ils_professional_work_items w
      JOIN public.ils_professional_work_assignment_links l
        ON l.work_item_id=w.id AND l.work_stream='PROFESSIONAL'
       AND l.professional_user_id=p_professional_user_id AND l.link_status='APPROVED'
      JOIN public.ils_unified_assignment_decisions u
        ON u.id=l.assignment_decision_id AND u.associate_user_id=p_professional_user_id
       AND u.decision='ALLOW' AND u.requires_supervision=false
       AND u.requires_professional_review=false
      WHERE w.id=p_work_item_id AND w.professional_user_id=p_professional_user_id
    )
    WHEN p_work_stream='B2B' THEN EXISTS(
      SELECT 1
      FROM public.ils_b2b_work_items w
      JOIN public.ils_professional_work_assignment_links l
        ON l.work_item_id=w.id AND l.work_stream='B2B'
       AND l.professional_user_id=p_professional_user_id AND l.link_status='APPROVED'
      JOIN public.ils_unified_assignment_decisions u
        ON u.id=l.assignment_decision_id AND u.associate_user_id=p_professional_user_id
       AND u.decision='ALLOW' AND u.requires_supervision=false
       AND u.requires_professional_review=false
      WHERE w.id=p_work_item_id AND w.professional_user_id=p_professional_user_id
    )
    ELSE false
  END;
$function$;
REVOKE ALL ON FUNCTION public.ils_professional_assignment_is_current(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_is_current(uuid,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_telemetry_aggregate(p_window_minutes integer DEFAULT 15)
RETURNS TABLE(failure_code text,observed_count bigint,decision text,threshold_type text)
LANGUAGE sql STABLE AS $function$
  SELECT t.failure_code,count(e.id),
    CASE WHEN count(e.id)>=t.stop_threshold THEN 'STOP'
         WHEN count(e.id)>=t.review_threshold THEN 'REVIEW' ELSE 'NORMAL' END,
    CASE WHEN count(e.id)>=t.stop_threshold THEN 'STOP_THRESHOLD'
         WHEN count(e.id)>=t.review_threshold THEN 'REVIEW_THRESHOLD' ELSE 'BELOW_REVIEW' END
  FROM public.ils_professional_assignment_mutation_alert_thresholds t
  LEFT JOIN public.ils_professional_assignment_mutation_failure_telemetry e
    ON e.failure_code=t.failure_code
   AND e.occurred_at>=clock_timestamp()-make_interval(mins=>p_window_minutes)
  WHERE t.active AND t.window_minutes=p_window_minutes
  GROUP BY t.failure_code,t.review_threshold,t.stop_threshold;
$function$;

-- Original Action 478 gate, with the Action 615 internal-RPC ACL applied below.
CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_gate(
  p_assignment_link_id uuid,p_operation text,p_to_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  IF auth.uid() IS NULL OR p_assignment_link_id IS NULL
     OR p_operation NOT IN ('ACTIVATE','PAUSE','REVOKE','COMPLETE') THEN
    RETURN false;
  END IF;
  SELECT l.id,l.work_item_id,l.work_stream,l.professional_user_id,l.link_status
    INTO v
  FROM public.ils_professional_work_assignment_links l
  WHERE l.id=p_assignment_link_id AND l.professional_user_id=auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_operation='ACTIVATE' AND p_to_status IS DISTINCT FROM 'ACTIVE' THEN RETURN false; END IF;
  IF p_operation='PAUSE' AND p_to_status IS DISTINCT FROM 'PAUSED' THEN RETURN false; END IF;
  IF p_operation='REVOKE' AND p_to_status IS DISTINCT FROM 'REVOKED' THEN RETURN false; END IF;
  IF p_operation='COMPLETE' AND p_to_status IS DISTINCT FROM 'COMPLETED' THEN RETURN false; END IF;
  IF NOT public.ils_professional_assignment_transition_allowed(v.link_status,p_to_status) THEN RETURN false; END IF;
  IF p_operation='ACTIVATE' AND NOT public.ils_professional_assignment_is_current(v.work_item_id,v.work_stream,v.professional_user_id) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_commit(
  p_assignment_link_id uuid,p_operation text,p_to_status text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record; v_prev_hash text; v_event_hash text;
BEGIN
  IF NOT public.ils_professional_assignment_mutation_gate(p_assignment_link_id,p_operation,p_to_status) THEN RETURN false; END IF;
  SELECT l.id,l.work_item_id,l.work_stream,l.professional_user_id,l.link_status
  INTO v FROM public.ils_professional_work_assignment_links l
  WHERE l.id=p_assignment_link_id AND l.professional_user_id=auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT public.ils_professional_assignment_mutation_gate(v.id,p_operation,p_to_status) THEN RETURN false; END IF;
  SELECT e.event_hash INTO v_prev_hash FROM public.ils_professional_assignment_mutation_event_chain e
  WHERE e.assignment_link_id=v.id ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1;
  v_event_hash:=md5(coalesce(v_prev_hash,'')||'|'||v.id::text||'|'||v.work_item_id::text||'|'||v.work_stream||'|'||v.professional_user_id::text||'|'||p_operation||'|'||coalesce(v.link_status,'')||'|'||p_to_status||'|'||clock_timestamp()::text);
  UPDATE public.ils_professional_work_assignment_links SET link_status=p_to_status,updated_at=now()
  WHERE id=v.id AND link_status=v.link_status;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.ils_professional_assignment_mutation_audit
    (assignment_link_id,work_item_id,work_stream,professional_user_id,operation,from_status,to_status,decision,reason_code)
  VALUES(v.id,v.work_item_id,v.work_stream,v.professional_user_id,p_operation,v.link_status,p_to_status,'ALLOW','MUTATION_COMMIT');
  INSERT INTO public.ils_professional_assignment_mutation_event_chain
    (assignment_link_id,work_item_id,work_stream,professional_user_id,operation,from_status,to_status,decision,reason_code,event_hash,previous_event_hash)
  VALUES(v.id,v.work_item_id,v.work_stream,v.professional_user_id,p_operation,v.link_status,p_to_status,'ALLOW','MUTATION_COMMIT',v_event_hash,v_prev_hash);
  RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$function$;

-- Match the historical internal-RPC privilege boundary (Actions 613/615).
REVOKE ALL ON FUNCTION public.ils_professional_assignment_mutation_commit(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_mutation_commit(uuid,text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.ils_professional_assignment_mutation_gate(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_mutation_gate(uuid,text,text)
  TO service_role;
