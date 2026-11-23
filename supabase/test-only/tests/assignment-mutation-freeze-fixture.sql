-- Disposable PostgreSQL fixture for assignment mutation freeze tests.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
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
$$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;

CREATE TABLE public.ils_professional_assignment_mutation_failure_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_code text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
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

CREATE TABLE public.ils_professional_work_assignment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL,
  work_stream text NOT NULL,
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
RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$ SELECT (p_from,p_to) IN (('PENDING','ACTIVE'),('ACTIVE','PAUSED'),('PAUSED','ACTIVE'),('ACTIVE','REVOKED'),('ACTIVE','COMPLETED')) $$;
CREATE OR REPLACE FUNCTION public.ils_professional_assignment_is_current(p_work_item_id uuid,p_work_stream text,p_professional_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

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
