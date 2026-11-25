-- Align matter/advocate storage and multi-assignment admin authorization with ils_admin_users.
-- This migration preserves public approved-photo reads and public pending-photo uploads.
DO $preflight$
BEGIN
  IF to_regprocedure('public.ils_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Admin identity hardening blocked: public.ils_is_admin() is missing';
  END IF;
  IF to_regprocedure('public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)') IS NULL THEN
    RAISE EXCEPTION 'Admin identity hardening blocked: reviewed ils_admin_save_lead_multi RPC is missing';
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Admin identity hardening blocked: storage.objects is missing';
  END IF;
END
$preflight$;

-- Replace only reviewed email-only guards. Keep v_email in assignment RPCs because
-- the existing functions use it as audit attribution in advocate_assignments.
DO $rpc_hardening$
DECLARE
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_old_guard text;
  v_new_guard text;
  v_expected_decl text;
  v_count integer;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_admin_client_portal(bigint)',
    'public.admin_send_client_message(bigint,text)',
    'public.ils_admin_save_lead(bigint,text,text,text,bigint,boolean,date,text)',
    'public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);

    -- TEST's recovered schema currently lacks three Production RPCs. Skip only
    -- those absent functions; any present function must match the reviewed body.
    IF v_oid IS NULL THEN
      RAISE NOTICE 'Skipping absent TEST-baseline admin RPC: %', v_signature;
      CONTINUE;
    END IF;

    v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    IF v_signature IN (
      'public.get_admin_client_portal(bigint)',
      'public.admin_send_client_message(bigint,text)'
    ) THEN
      v_old_guard := E'    IF (auth.jwt() ->> \'email\') <> \'fahat29@gmail.com\' THEN';
      v_new_guard := '    IF NOT public.ils_is_admin() THEN';
      v_expected_decl := NULL;
    ELSE
      v_old_guard := E'  if v_email <> \'fahat29@gmail.com\' then';
      v_new_guard := '  if not public.ils_is_admin() then';
      v_expected_decl := E'  v_email text := lower(coalesce(auth.jwt()->>\'email\',\'\'));';
    END IF;

    v_count := (length(v_definition) - length(replace(v_definition, v_old_guard, '')))
               / length(v_old_guard);

    IF v_count <> 1
       OR position(E'SET search_path TO \'public\'' in v_definition) = 0
       OR (v_expected_decl IS NOT NULL AND position(v_expected_decl in v_definition) = 0) THEN
      RAISE EXCEPTION 'Reviewed admin RPC source mismatch in %; refusing to rewrite', v_signature;
    END IF;

    v_definition := replace(v_definition, v_old_guard, v_new_guard);

    IF position('fahat29@gmail.com' in v_definition) > 0
       OR position(v_new_guard in v_definition) = 0 THEN
      RAISE EXCEPTION 'Admin identity guard postcondition failed for %', v_signature;
    END IF;

    EXECUTE v_definition;
  END LOOP;
END
$rpc_hardening$;

-- Remove legacy policies that accidentally grant every authenticated user access
-- to pending advocate photos or permission to move pending/approved photo objects.
DROP POLICY IF EXISTS "Admin can move advocate photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can read advocate photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can view advocate photos" ON storage.objects;
-- New registrations upload to the private advocate-photo-pending bucket. Stop the
-- legacy policy from placing additional pending photos in the public advocate-photo bucket.
DROP POLICY IF EXISTS "Public can upload advocate photos" ON storage.objects;

-- Replace email-only admin policies with the canonical configured-admin predicate.
DROP POLICY IF EXISTS "ils_admin_advocate_pending_management" ON storage.objects;
CREATE POLICY "ils_admin_advocate_pending_management"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'advocate-photo-pending'
  AND public.ils_is_admin()
)
WITH CHECK (
  bucket_id = 'advocate-photo-pending'
  AND public.ils_is_admin()
);

DROP POLICY IF EXISTS "ils_admin_advocate_public_photo_management" ON storage.objects;
CREATE POLICY "ils_admin_advocate_public_photo_management"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'advocate-photo'
  AND public.ils_is_admin()
)
WITH CHECK (
  bucket_id = 'advocate-photo'
  AND public.ils_is_admin()
);

DROP POLICY IF EXISTS "Admin manage matter document objects" ON storage.objects;
CREATE POLICY "Admin manage matter document objects"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'client-matter-documents'
  AND public.ils_is_admin()
)
WITH CHECK (
  bucket_id = 'client-matter-documents'
  AND public.ils_is_admin()
);

-- Recreate the narrowly scoped public surface explicitly. TEST may not yet have
-- these policies even though Production does; bucket absence is not a reason to
-- leave policy definitions missing from the restored TEST baseline.
DROP POLICY IF EXISTS "ils_public_approved_advocate_photo_read" ON storage.objects;
CREATE POLICY "ils_public_approved_advocate_photo_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'advocate-photo'
  AND name LIKE 'approved/%'
);

DROP POLICY IF EXISTS "ils_public_advocate_pending_insert" ON storage.objects;
CREATE POLICY "ils_public_advocate_pending_insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'advocate-photo-pending'
  AND name LIKE 'pending/%'
);

-- Verify the intended public surface: pending-only uploads and approved-only reads.
DO $verify$
DECLARE
  v_signature text;
  v_oid regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_admin_client_portal(bigint)',
    'public.admin_send_client_message(bigint,text)',
    'public.ils_admin_save_lead(bigint,text,text,text,bigint,boolean,date,text)',
    'public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      CONTINUE;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected admin RPC execute grants: %', v_signature;
    END IF;

    IF position('public.ils_is_admin()' in pg_get_functiondef(v_oid)) = 0
       OR position('fahat29@gmail.com' in pg_get_functiondef(v_oid)) > 0 THEN
      RAISE EXCEPTION 'Admin RPC still contains an email-only authorization guard: %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('Admin can move advocate photos', 'Admin can read advocate photos', 'Admin can view advocate photos')
  ) THEN
    RAISE EXCEPTION 'Legacy overbroad advocate-photo policy remains active';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('Public can upload advocate photos')
  ) THEN
    RAISE EXCEPTION 'Legacy public-bucket pending-photo upload policy remains active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ils_public_approved_advocate_photo_read'
      AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ils_public_advocate_pending_insert'
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'Expected public approved-photo read or private pending-photo upload policy is missing';
  END IF;
END
$verify$
