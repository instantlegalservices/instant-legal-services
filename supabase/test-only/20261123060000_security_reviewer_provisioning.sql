-- TEST-only security reviewer administration contract.
-- The first SECURITY_ADMIN is bootstrapped out-of-band by the project owner;
-- this RPC can grant/suspend/revoke SECURITY_REVIEWER only, never SECURITY_ADMIN.

ALTER TABLE public.ils_professional_security_reviewer_authorizations
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

REVOKE ALL ON public.ils_professional_security_reviewer_authorizations
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.ils_professional_security_reviewer_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid,
  subject_user_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('GRANT_REVIEWER','SUSPEND_REVIEWER','REVOKE_REVIEWER')),
  reviewer_role text NOT NULL CHECK (reviewer_role='SECURITY_REVIEWER'),
  prior_status text,
  new_status text NOT NULL CHECK (new_status IN ('ACTIVE','SUSPENDED','REVOKED')),
  identity_evidence_ref text,
  training_evidence_ref text,
  reason text NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.ils_professional_security_reviewer_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ils_professional_security_reviewer_admin_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ils_professional_security_reviewer_admin_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ils_professional_security_reviewer_admin_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'SECURITY_REVIEWER_ADMIN_AUDIT_APPEND_ONLY';
END;
$function$;

DROP TRIGGER IF EXISTS ils_prof_security_reviewer_admin_audit_no_row_mutation
  ON public.ils_professional_security_reviewer_admin_audit;
CREATE TRIGGER ils_prof_security_reviewer_admin_audit_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.ils_professional_security_reviewer_admin_audit
  FOR EACH ROW EXECUTE FUNCTION public.ils_professional_security_reviewer_admin_audit_append_only();

DROP TRIGGER IF EXISTS ils_prof_security_reviewer_admin_audit_no_truncate
  ON public.ils_professional_security_reviewer_admin_audit;
CREATE TRIGGER ils_prof_security_reviewer_admin_audit_no_truncate
  BEFORE TRUNCATE ON public.ils_professional_security_reviewer_admin_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.ils_professional_security_reviewer_admin_audit_append_only();

REVOKE ALL ON FUNCTION public.ils_professional_security_reviewer_admin_audit_append_only()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ils_professional_security_reviewer_administer(
  p_subject_user_id uuid,
  p_operation text,
  p_reason text,
  p_identity_evidence_ref text DEFAULT NULL,
  p_training_evidence_ref text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_auth record;
  v_subject_auth record;
  v_existing record;
  v_authorization_id uuid;
  v_prior_status text;
  v_new_status text;
  v_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_ADMIN_AUTH_REQUIRED';
  END IF;
  IF p_subject_user_id IS NULL OR p_subject_user_id=v_actor THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_SELF_ADMINISTRATION_BLOCKED';
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('GRANT','SUSPEND','REVOKE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_OPERATION_INVALID';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason))<20 OR length(trim(p_reason))>1000 THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_REASON_INVALID';
  END IF;

  SELECT r.*
    INTO v_actor_auth
  FROM public.ils_professional_security_reviewer_authorizations r
  WHERE r.user_id=v_actor
    AND r.reviewer_role='SECURITY_ADMIN'
    AND r.authorization_status='ACTIVE'
    AND r.identity_verified=true
    AND r.security_training_verified=true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SECURITY_ADMIN_REQUIRED';
  END IF;

  SELECT u.id,u.email_confirmed_at
    INTO v_subject_auth
  FROM auth.users u
  WHERE u.id=p_subject_user_id
  FOR SHARE;
  IF NOT FOUND OR v_subject_auth.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_TARGET_IDENTITY_UNVERIFIED';
  END IF;

  SELECT r.id,r.reviewer_role,r.authorization_status,r.valid_from,r.valid_until
    INTO v_existing
  FROM public.ils_professional_security_reviewer_authorizations r
  WHERE r.user_id=p_subject_user_id
  FOR UPDATE;
  v_prior_status:=CASE WHEN FOUND THEN v_existing.authorization_status ELSE NULL END;

  -- Capture wall-clock time only after all authorization/subject/target locks
  -- are acquired. The function-entry timestamp can become stale while waiting.
  v_now := clock_timestamp();
  IF (v_actor_auth.valid_from IS NOT NULL AND v_actor_auth.valid_from>v_now)
     OR (v_actor_auth.valid_until IS NOT NULL AND v_actor_auth.valid_until<v_now) THEN
    RAISE EXCEPTION 'SECURITY_ADMIN_REQUIRED';
  END IF;

  IF FOUND AND v_existing.reviewer_role='SECURITY_ADMIN' THEN
    RAISE EXCEPTION 'SECURITY_ADMIN_ROLE_REQUIRES_OWNER_BOOTSTRAP';
  END IF;
  IF FOUND AND v_existing.reviewer_role<>'SECURITY_REVIEWER' THEN
    RAISE EXCEPTION 'SECURITY_REVIEWER_TARGET_ROLE_CONFLICT';
  END IF;

  IF p_operation='GRANT' THEN
    IF FOUND AND v_existing.authorization_status='ACTIVE'
       AND (v_existing.valid_until IS NULL OR v_existing.valid_until>=v_now) THEN
      RAISE EXCEPTION 'SECURITY_REVIEWER_ALREADY_ACTIVE';
    END IF;
    IF p_identity_evidence_ref IS NULL
       OR p_identity_evidence_ref !~ '^ILS-SEC-ID-[A-Z0-9-]{4,40}$'
       OR p_training_evidence_ref IS NULL
       OR p_training_evidence_ref !~ '^ILS-SEC-TRAIN-[A-Z0-9-]{4,40}$' THEN
      RAISE EXCEPTION 'SECURITY_REVIEWER_VERIFICATION_EVIDENCE_REQUIRED';
    END IF;
    IF p_valid_until IS NULL
       OR p_valid_until<v_now+interval '1 day'
       OR p_valid_until>v_now+interval '365 days' THEN
      RAISE EXCEPTION 'SECURITY_REVIEWER_VALIDITY_WINDOW_INVALID';
    END IF;

    INSERT INTO public.ils_professional_security_reviewer_authorizations
      (user_id,reviewer_role,authorization_status,identity_verified,
       security_training_verified,assigned_by,valid_from,valid_until,created_at,updated_at)
    VALUES
      (p_subject_user_id,'SECURITY_REVIEWER','ACTIVE',true,true,
       v_actor,v_now,p_valid_until,v_now,v_now)
    ON CONFLICT (user_id) DO UPDATE SET
      reviewer_role='SECURITY_REVIEWER',
      authorization_status='ACTIVE',
      identity_verified=true,
      security_training_verified=true,
      assigned_by=v_actor,
      valid_from=v_now,
      valid_until=p_valid_until,
      updated_at=v_now
    RETURNING id INTO v_authorization_id;
    v_new_status:='ACTIVE';

  ELSE
    IF NOT FOUND OR v_existing.reviewer_role<>'SECURITY_REVIEWER'
       OR v_existing.authorization_status NOT IN ('ACTIVE','SUSPENDED') THEN
      RAISE EXCEPTION 'SECURITY_REVIEWER_NOT_ADMINISTRABLE';
    END IF;
    v_new_status:=CASE WHEN p_operation='SUSPEND' THEN 'SUSPENDED' ELSE 'REVOKED' END;
    UPDATE public.ils_professional_security_reviewer_authorizations
    SET authorization_status=v_new_status,
        updated_at=v_now
    WHERE user_id=p_subject_user_id
    RETURNING id INTO v_authorization_id;
  END IF;

  INSERT INTO public.ils_professional_security_reviewer_admin_audit
    (authorization_id,subject_user_id,actor_user_id,operation,reviewer_role,
     prior_status,new_status,identity_evidence_ref,training_evidence_ref,
     reason,valid_from,valid_until,created_at)
  VALUES
    (v_authorization_id,p_subject_user_id,v_actor,
     CASE p_operation WHEN 'GRANT' THEN 'GRANT_REVIEWER'
       WHEN 'SUSPEND' THEN 'SUSPEND_REVIEWER' ELSE 'REVOKE_REVIEWER' END,
     'SECURITY_REVIEWER',v_prior_status,v_new_status,
     CASE WHEN p_operation='GRANT' THEN p_identity_evidence_ref ELSE NULL END,
     CASE WHEN p_operation='GRANT' THEN p_training_evidence_ref ELSE NULL END,
     trim(p_reason),
     CASE WHEN p_operation='GRANT' THEN v_now ELSE v_existing.valid_from END,
     CASE WHEN p_operation='GRANT' THEN p_valid_until ELSE v_existing.valid_until END,
     v_now);

  RETURN jsonb_build_object(
    'ok',true,
    'subject_user_id',p_subject_user_id,
    'authorization_id',v_authorization_id,
    'reviewer_role','SECURITY_REVIEWER',
    'prior_status',v_prior_status,
    'authorization_status',v_new_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_security_reviewer_administer(uuid,text,text,text,text,timestamptz)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ils_professional_security_reviewer_administer(uuid,text,text,text,text,timestamptz)
  TO authenticated;
