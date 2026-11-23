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

-- Replace only the reviewed email-only authorization guard. Keep v_email because
-- the existing RPC uses it as audit attribution in advocate_assignments.
DO $rpc_hardening$
DECLARE
  v_signature text := 'public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)';
  v_oid regprocedure;
  v_definition text;
  v_old_guard text := E'  if v_email <> \'fahat29@gmail.com\' then';
  v_new_guard text := '  if not public.ils_is_admin() then';
  v_count integer;
BEGIN
  v_oid := to_regprocedure(v_signature);
  v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_count := (length(v_definition) - length(replace(v_definition, v_old_guard, '')))
             / length(v_old_guard);

  IF v_count <> 1
     OR position(E'  v_email text := lower(coalesce(auth.jwt()->>\'email\',\'\'));' in v_definition) = 0
     OR position(E'SET search_path TO \'public\'' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Reviewed ils_admin_save_lead_multi source mismatch; refusing to rewrite';
  END IF;

  v_definition := replace(v_definition, v_old_guard, v_new_guard);
  IF position('fahat29@gmail.com' in v_definition) > 0
     OR position('if not public.ils_is_admin() then' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Admin identity guard postcondition failed for ils_admin_save_lead_multi';
  END IF;

  EXECUTE v_definition;
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

-- Preserve the intended public surface: pending-only uploads and approved-only reads.
DO $verify$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)');
BEGIN
  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected ils_admin_save_lead_multi execute grants';
  END IF;

  IF position('public.ils_is_admin()' in pg_get_functiondef(v_rpc)) = 0
     OR position('fahat29@gmail.com' in pg_get_functiondef(v_rpc)) > 0 THEN
    RAISE EXCEPTION 'Admin RPC still contains an email-only authorization guard';
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
    RAISE EXCEPTION 'Expected public approved-photo read or pending-photo upload policy is missing';
  END IF;

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
      AND policyname = 'Public can upload advocate photos'
  ) THEN
    RAISE EXCEPTION 'Legacy public-bucket pending-photo upload policy remains active';
  END IF;
END
$verify$;
