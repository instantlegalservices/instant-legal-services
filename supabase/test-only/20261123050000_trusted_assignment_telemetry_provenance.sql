-- TEST-only trusted telemetry provenance boundary.
-- Unauthenticated failures are not Professional Assignment mutation telemetry.
-- Existing rows are retained as LEGACY_UNTRUSTED and excluded from aggregation.
ALTER TABLE public.ils_professional_assignment_mutation_failure_telemetry
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'LEGACY_UNTRUSTED',
  ADD COLUMN IF NOT EXISTS source_event_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS producer_version text,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.ils_professional_assignment_mutation_failure_telemetry'::regclass
      AND conname='ils_assignment_failure_telemetry_source_check'
  ) THEN
    ALTER TABLE public.ils_professional_assignment_mutation_failure_telemetry
      ADD CONSTRAINT ils_assignment_failure_telemetry_source_check
      CHECK (
        source_type='LEGACY_UNTRUSTED'
        OR (
          source_type='SERVER_VERIFIED_MUTATION'
          AND failure_code<>'AUTH_REQUIRED'
          AND source_event_id IS NOT NULL
          AND actor_user_id IS NOT NULL
          AND professional_user_id IS NOT NULL
          AND assignment_link_id IS NOT NULL
          AND operation IS NOT NULL
          AND producer_version IS NOT NULL
          AND dedupe_key IS NOT NULL
        )
      );
  END IF;
END;
$constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS ils_assignment_failure_source_event_uq
  ON public.ils_professional_assignment_mutation_failure_telemetry(source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ils_assignment_failure_dedupe_uq
  ON public.ils_professional_assignment_mutation_failure_telemetry(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- AUTH_REQUIRED is generated before a user is authenticated. It cannot
-- identify a verified professional actor and must never drive assignment
-- review/STOP thresholds.
UPDATE public.ils_professional_assignment_mutation_alert_thresholds
SET active=false
WHERE failure_code='AUTH_REQUIRED';

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_record_trusted_mutation_failure(
  p_actor_user_id uuid,
  p_assignment_link_id uuid,
  p_operation text,
  p_requested_status text,
  p_failure_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_assignment record;
  v_now timestamptz:=clock_timestamp();
  v_dedupe_key text;
  v_event_id uuid:=gen_random_uuid();
  v_safe_message text;
  v_failure_class text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'MUTATION_TELEMETRY_SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_actor_user_id IS NULL OR p_assignment_link_id IS NULL
     OR p_operation IS NULL OR p_operation !~ '^[A-Z_]{1,32}$'
     OR (p_requested_status IS NOT NULL AND p_requested_status !~ '^[A-Z_]{1,32}$') THEN
    RAISE EXCEPTION 'MUTATION_TELEMETRY_INPUT_INVALID';
  END IF;
  IF p_failure_code IS NULL OR p_failure_code NOT IN (
    'CROSS_USER_ASSIGNMENT','CROSS_STREAM','DUPLICATE_ASSIGNMENT',
    'INVALID_OPERATION','INVALID_TRANSITION','REPLAY_AFTER_COMPLETE',
    'REPLAY_AFTER_REVOKE','STALE_ELIGIBILITY','STATUS_MISMATCH'
  ) THEN
    RAISE EXCEPTION 'MUTATION_TELEMETRY_FAILURE_CODE_NOT_ALLOWED';
  END IF;

  SELECT l.id,l.work_item_id,l.work_stream,l.professional_user_id
    INTO v_assignment
  FROM public.ils_professional_work_assignment_links l
  WHERE l.id=p_assignment_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MUTATION_TELEMETRY_ASSIGNMENT_NOT_FOUND';
  END IF;

  v_failure_class:=CASE
    WHEN p_failure_code IN ('CROSS_USER_ASSIGNMENT','CROSS_STREAM') THEN 'AUTHORIZATION'
    WHEN p_failure_code IN ('STALE_ELIGIBILITY') THEN 'ELIGIBILITY'
    WHEN p_failure_code IN ('REPLAY_AFTER_COMPLETE','REPLAY_AFTER_REVOKE') THEN 'REPLAY'
    ELSE 'VALIDATION'
  END;
  v_safe_message:=CASE p_failure_code
    WHEN 'CROSS_USER_ASSIGNMENT' THEN 'Assignment is not owned by the authenticated professional.'
    WHEN 'CROSS_STREAM' THEN 'Requested work stream does not match the assignment.'
    WHEN 'DUPLICATE_ASSIGNMENT' THEN 'A conflicting assignment already exists.'
    WHEN 'INVALID_OPERATION' THEN 'Requested assignment operation is not supported.'
    WHEN 'INVALID_TRANSITION' THEN 'Requested lifecycle transition is not allowed.'
    WHEN 'REPLAY_AFTER_COMPLETE' THEN 'A completed assignment cannot be reactivated.'
    WHEN 'REPLAY_AFTER_REVOKE' THEN 'A revoked assignment cannot be reactivated.'
    WHEN 'STALE_ELIGIBILITY' THEN 'Current professional eligibility checks did not pass.'
    WHEN 'STATUS_MISMATCH' THEN 'Requested status does not match the operation.'
    ELSE 'Assignment mutation was rejected.'
  END;

  -- One event per actor/assignment/failure/operation per UTC minute prevents
  -- a single retry loop from manufacturing an unbounded global alert count.
  v_dedupe_key:=md5(concat_ws('|',p_actor_user_id::text,p_assignment_link_id::text,
    p_failure_code,p_operation,date_trunc('minute',v_now AT TIME ZONE 'UTC')::text));

  INSERT INTO public.ils_professional_assignment_mutation_failure_telemetry
    (id,assignment_link_id,work_item_id,work_stream,professional_user_id,
     operation,requested_status,failure_code,failure_class,safe_message,
     source_gate,occurred_at,source_type,source_event_id,actor_user_id,
     producer_version,dedupe_key)
  VALUES
    (v_event_id,v_assignment.id,v_assignment.work_item_id,v_assignment.work_stream,
     p_actor_user_id,p_operation,p_requested_status,p_failure_code,v_failure_class,
     v_safe_message,'TRUSTED_SERVER_ASSIGNMENT_HANDLER_V1',v_now,
     'SERVER_VERIFIED_MUTATION',v_event_id,p_actor_user_id,
     'trusted-assignment-telemetry-v1',v_dedupe_key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM public.ils_professional_assignment_mutation_failure_telemetry
    WHERE dedupe_key=v_dedupe_key;
  END IF;
  RETURN v_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_assignment_record_trusted_mutation_failure(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_record_trusted_mutation_failure(uuid,uuid,text,text,text)
  TO service_role;

-- Do not let even the service_role API insert arbitrary "trusted" telemetry.
-- The SECURITY DEFINER producer above is the sole supported write path.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE
  ON public.ils_professional_assignment_mutation_failure_telemetry
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_telemetry_aggregate(
  p_window_minutes integer DEFAULT 15
)
RETURNS TABLE(failure_code text,observed_count bigint,decision text,threshold_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT t.failure_code,count(e.id),
    CASE WHEN count(e.id)>=t.stop_threshold THEN 'STOP'
         WHEN count(e.id)>=t.review_threshold THEN 'REVIEW' ELSE 'NORMAL' END,
    CASE WHEN count(e.id)>=t.stop_threshold THEN 'STOP_THRESHOLD'
         WHEN count(e.id)>=t.review_threshold THEN 'REVIEW_THRESHOLD' ELSE 'BELOW_REVIEW' END
  FROM public.ils_professional_assignment_mutation_alert_thresholds t
  LEFT JOIN public.ils_professional_assignment_mutation_failure_telemetry e
    ON e.failure_code=t.failure_code
   AND e.source_type='SERVER_VERIFIED_MUTATION'
   AND e.failure_code<>'AUTH_REQUIRED'
   AND e.occurred_at>=clock_timestamp()-make_interval(mins=>p_window_minutes)
  WHERE t.active=true AND t.window_minutes=p_window_minutes
  GROUP BY t.failure_code,t.review_threshold,t.stop_threshold;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_assignment_mutation_telemetry_aggregate(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_mutation_telemetry_aggregate(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ils_professional_assignment_telemetry_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'ASSIGNMENT_FAILURE_TELEMETRY_APPEND_ONLY';
END;
$function$;

DROP TRIGGER IF EXISTS ils_prof_assignment_failure_telemetry_no_row_mutation
  ON public.ils_professional_assignment_mutation_failure_telemetry;
CREATE TRIGGER ils_prof_assignment_failure_telemetry_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.ils_professional_assignment_mutation_failure_telemetry
  FOR EACH ROW EXECUTE FUNCTION public.ils_professional_assignment_telemetry_append_only_guard();

DROP TRIGGER IF EXISTS ils_prof_assignment_failure_telemetry_no_truncate
  ON public.ils_professional_assignment_mutation_failure_telemetry;
CREATE TRIGGER ils_prof_assignment_failure_telemetry_no_truncate
  BEFORE TRUNCATE ON public.ils_professional_assignment_mutation_failure_telemetry
  FOR EACH STATEMENT EXECUTE FUNCTION public.ils_professional_assignment_telemetry_append_only_guard();

REVOKE ALL ON FUNCTION public.ils_professional_assignment_telemetry_append_only_guard()
  FROM PUBLIC,anon,authenticated,service_role;
