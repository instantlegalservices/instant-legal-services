\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, service_role;

CREATE TABLE public.professional_join_requests (
  id bigint generated always as identity primary key,
  auth_user_id uuid,
  email text not null,
  professional_type text not null,
  status text not null,
  created_at timestamptz not null
);
CREATE TABLE public.advocate_registrations (
  id bigint generated always as identity primary key,
  auth_user_id uuid,
  email text,
  status text,
  created_at timestamptz not null
);

INSERT INTO public.professional_join_requests(auth_user_id,email,professional_type,status,created_at) VALUES
('00000000-0000-4000-8000-000000000001','shared@example.test','ca','Pending','2026-01-01T00:00:00Z'),
('00000000-0000-4000-8000-000000000002','shared@example.test','cs','Approved','2026-02-01T00:00:00Z'),
(NULL,'shared@example.test','hr','Pending','2026-03-01T00:00:00Z'),
('00000000-0000-4000-8000-000000000003','legacy@example.test','hr','Pending','2026-01-03T00:00:00Z'),
('00000000-0000-4000-8000-000000000002','protected@example.test','gst_practitioner','Pending','2026-01-04T00:00:00Z'),
('00000000-0000-4000-8000-000000000008','rejected@example.test','ca','Rejected','2026-01-05T00:00:00Z');

INSERT INTO public.advocate_registrations(auth_user_id,email,status,created_at) VALUES
('00000000-0000-4000-8000-000000000004','blocked-advocate@example.test','Rejected','2026-01-01T00:00:00Z'),
(NULL,'blocked-advocate@example.test','Pending','2026-02-01T00:00:00Z'),
('00000000-0000-4000-8000-000000000005','pending-advocate@example.test','Pending','2026-01-03T00:00:00Z'),
(NULL,'legacy-advocate@example.test','Pending','2026-01-04T00:00:00Z');

\i supabase/migrations/20261123200000_harden_professional_member_context_identity.sql

DO $permissions$
BEGIN
  IF has_function_privilege('anon','public.ils_professional_member_context()','EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute professional member context';
  END IF;
  IF NOT has_function_privilege('authenticated','public.ils_professional_member_context()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ils_professional_member_context()','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/service_role grants must be preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.ils_professional_member_context()'::regprocedure
      AND prosecdef
      AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'member context must be SECURITY DEFINER with empty search_path';
  END IF;
END
$permissions$;

DO $identity_cases$
DECLARE
  result_row record;
BEGIN
  -- Exact linked auth_user_id wins over a newer same-email legacy row.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"shared@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT TRUE OR result_row.profession <> 'ca' THEN
    RAISE EXCEPTION 'linked identity must win over newer same-email legacy profile; got % / %', result_row.is_member, result_row.profession;
  END IF;

  -- A user with no linked profile may use an unlinked legacy email record.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","email":"shared@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT TRUE OR result_row.profession <> 'hr' THEN
    RAISE EXCEPTION 'unlinked caller should use unlinked legacy fallback';
  END IF;

  -- A linked profile for a different user cannot be reached by email fallback.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000007","email":"protected@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT FALSE THEN
    RAISE EXCEPTION 'linked profile must not be exposed through email fallback';
  END IF;

  -- Pending professional applications remain eligible.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","email":"legacy@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT TRUE OR result_row.profession <> 'hr' THEN
    RAISE EXCEPTION 'pending legacy professional application must remain eligible';
  END IF;

  -- A rejected linked profile blocks fallback to a same-email unlinked profile.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","email":"blocked-advocate@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT FALSE THEN
    RAISE EXCEPTION 'rejected linked advocate profile must block legacy email fallback';
  END IF;

  -- Pending linked advocate registration remains eligible.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","email":"pending-advocate@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT TRUE OR result_row.profession <> 'advocate' THEN
    RAISE EXCEPTION 'pending linked advocate registration must remain eligible';
  END IF;

  -- A caller cannot inherit a linked advocate profile by matching its email.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","email":"pending-advocate@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT FALSE THEN
    RAISE EXCEPTION 'linked advocate profile must not be exposed through email fallback';
  END IF;

  -- Legacy unlinked advocate registration remains eligible.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010","email":"legacy-advocate@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT TRUE OR result_row.profession <> 'advocate' THEN
    RAISE EXCEPTION 'unlinked legacy advocate registration should retain email fallback';
  END IF;

  -- Auth metadata alone cannot grant membership.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","email":"none@example.test","app_metadata":{"profession":"advocate"}}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT FALSE THEN
    RAISE EXCEPTION 'app_metadata alone must not grant member access';
  END IF;

  -- Rejected professional application remains excluded.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000008","email":"rejected@example.test"}',true);
  SELECT * INTO result_row FROM public.ils_professional_member_context();
  IF result_row.is_member IS NOT FALSE THEN
    RAISE EXCEPTION 'rejected application must remain excluded';
  END IF;
END
$identity_cases$;

\echo PASS: member identity precedence, legacy fallback, pending eligibility, rejected denial, metadata denial, grants and empty search_path verified.
