-- Harden the three advocate matter RPCs without changing their response or assignment model.
-- Recovered from Production read-only catalog; fail closed if the exact dependencies or
-- reviewed function bodies are not present. This is NOT a schema-restoration migration.
DO $preflight$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.advocate_registrations',
    'public.advocate_assignments',
    'public.client_requirements',
    'public.client_chat_messages',
    'public.client_work_progress',
    'public.client_matter_documents'
  ] LOOP
    IF to_regclass(v_name) IS NULL THEN
      RAISE EXCEPTION 'Advocate matter RPC hardening blocked: required relation % is missing', v_name;
    END IF;
  END LOOP;

  IF to_regprocedure('public.get_advocate_client_portal(bigint)') IS NULL
     OR to_regprocedure('public.advocate_send_client_message(bigint,text)') IS NULL
     OR to_regprocedure('public.advocate_add_work_progress(bigint,text,text,text,boolean,date,date,date)') IS NULL THEN
    RAISE EXCEPTION 'Advocate matter RPC hardening blocked: one or more reviewed RPC signatures are missing';
  END IF;
END
$preflight$;

-- Resolve exactly one advocate registration for the authenticated Supabase identity.
-- A linked-but-unapproved identity never falls back to an unlinked email match.
-- Legacy email matching is permitted only when no linked row exists and exactly one
-- unlinked row matches. Both approval columns must independently be Approved.
CREATE OR REPLACE FUNCTION public.ils_current_approved_advocate()
RETURNS public.advocate_registrations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt()->>'email', '')));
  v_linked_count integer;
  v_legacy_count integer;
  v_advocate public.advocate_registrations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_linked_count
  FROM public.advocate_registrations AS ar
  WHERE ar.auth_user_id = v_user_id;

  IF v_linked_count > 1 THEN
    RETURN NULL;
  ELSIF v_linked_count = 1 THEN
    SELECT ar.* INTO v_advocate
    FROM public.advocate_registrations AS ar
    WHERE ar.auth_user_id = v_user_id;

    IF lower(btrim(coalesce(v_advocate.status, ''))) <> 'approved'
       OR lower(btrim(coalesce(v_advocate.verification_status, ''))) <> 'approved' THEN
      RETURN NULL;
    END IF;

    RETURN v_advocate;
  END IF;

  IF v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_legacy_count
  FROM public.advocate_registrations AS ar
  WHERE ar.auth_user_id IS NULL
    AND lower(btrim(coalesce(ar.email, ''))) = v_email;

  IF v_legacy_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT ar.* INTO v_advocate
  FROM public.advocate_registrations AS ar
  WHERE ar.auth_user_id IS NULL
    AND lower(btrim(coalesce(ar.email, ''))) = v_email;

  IF lower(btrim(coalesce(v_advocate.status, ''))) <> 'approved'
     OR lower(btrim(coalesce(v_advocate.verification_status, ''))) <> 'approved' THEN
    RETURN NULL;
  END IF;

  RETURN v_advocate;
END
$function$;

-- This resolver is an internal SECURITY DEFINER helper, never a client-callable RPC.
REVOKE ALL ON FUNCTION public.ils_current_approved_advocate()
  FROM PUBLIC, anon, authenticated, service_role;

DO $hardening$
DECLARE
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_old_identity text := E'    select *\n    into a\n    from public.advocate_registrations\n    where coalesce(verification_status,status,\'Pending\') = \'Approved\'\n      and (\n          auth_user_id = auth.uid()\n          or lower(trim(email)) = v_email\n      )\n    limit 1;';
  v_old_email_decl text := E'    v_email text := lower(trim(auth.jwt()->>\'email\'));\n';
  v_old_search_path text := E'SET search_path TO \'public\'';
  v_new_identity text := E'    select * into a from public.ils_current_approved_advocate();';
  v_old_count integer;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_advocate_client_portal(bigint)',
    'public.advocate_send_client_message(bigint,text)',
    'public.advocate_add_work_progress(bigint,text,text,text,boolean,date,date,date)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    v_old_count := (length(v_definition) - length(replace(v_definition, v_old_identity, '')))
                   / length(v_old_identity);
    IF v_old_count <> 1 THEN
      RAISE EXCEPTION 'Reviewed identity block mismatch in %; expected exactly one old block, found %', v_signature, v_old_count;
    END IF;

    IF position(v_old_search_path in v_definition) = 0 THEN
      RAISE EXCEPTION 'Reviewed search_path clause mismatch in %', v_signature;
    END IF;

    v_definition := replace(v_definition, v_old_identity, v_new_identity);
    v_definition := replace(v_definition, v_old_email_decl, '');
    v_definition := replace(v_definition, v_old_search_path, E'SET search_path TO \'\'');

    IF position('ils_current_approved_advocate' in v_definition) = 0
       OR position(E'SET search_path TO \'\'' in v_definition) = 0 THEN
      RAISE EXCEPTION 'Hardened definition validation failed for %', v_signature;
    END IF;

    EXECUTE v_definition;
  END LOOP;
END
$hardening$;

-- CREATE OR REPLACE preserves the reviewed RPC ACLs. Verify authenticated and service-role
-- execution remains available, anon remains denied, and the helper is not directly callable.
DO $verify$
DECLARE
  v_signature text;
  v_oid regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_advocate_client_portal(bigint)',
    'public.advocate_send_client_message(bigint,text)',
    'public.advocate_add_work_progress(bigint,text,text,text,boolean,date,date,date)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected RPC execute grants after hardening: %', v_signature;
    END IF;

    IF position('ils_current_approved_advocate' in pg_get_functiondef(v_oid)) = 0
       OR position(E'SET search_path TO \'\'' in pg_get_functiondef(v_oid)) = 0 THEN
      RAISE EXCEPTION 'RPC hardening postcondition failed: %', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.ils_current_approved_advocate()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ils_current_approved_advocate()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.ils_current_approved_advocate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Internal advocate resolver must not be directly executable by API roles';
  END IF;
END
$verify$;
