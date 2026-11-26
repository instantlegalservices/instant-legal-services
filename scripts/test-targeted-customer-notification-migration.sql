-- Disposable PostgreSQL 16 integration test for the exact Phase-1 migration.
-- Run after scripts/test-business-compliance-postgres.sql in CI. No production data.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

ALTER TABLE public.service_requests
  ADD COLUMN user_id uuid REFERENCES auth.users(id),
  ADD COLUMN status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','assigned','in_progress','completed','cancelled','refunded')),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

INSERT INTO auth.users(id) VALUES
 ('80b895a6-476e-459e-869d-f52dde18792b'),
 ('a871e397-8d77-49cb-ad66-8c4951286d5d');

\i supabase/migrations/20261126083000_targeted_customer_in_app_notifications_v1.sql

DO $phase1_event_test$
DECLARE
  v_request_id uuid := '22222222-2222-4222-8222-222222222222';
  v_null_user_request_id uuid := '33333333-3333-4333-8333-333333333333';
  v_count integer;
BEGIN
  INSERT INTO public.service_requests(id,user_id,status,details)
  VALUES (v_request_id,'80b895a6-476e-459e-869d-f52dde18792b','pending','{"sensitive":"must-not-leak"}');

  UPDATE public.service_requests SET status='in_progress' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='in_progress' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='paid' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='assigned' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='refunded' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='completed' WHERE id=v_request_id;
  UPDATE public.service_requests SET status='cancelled' WHERE id=v_request_id;

  SELECT count(*) INTO v_count
  FROM public.ils_notification_customer_projection
  WHERE source_record_id=v_request_id;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected exactly 4 allowed lifecycle notifications; got %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ils_notification_customer_projection
    WHERE source_record_id=v_request_id
      AND (safe_message ILIKE '%sensitive%' OR safe_message ILIKE '%must-not-leak%')
  ) THEN
    RAISE EXCEPTION 'Sensitive service-request details leaked into notification';
  END IF;

  INSERT INTO public.service_requests(id,user_id,status,details)
  VALUES (v_null_user_request_id,NULL,'pending','{}'::jsonb);
  IF EXISTS (
    SELECT 1 FROM public.ils_notification_customer_projection
    WHERE source_record_id=v_null_user_request_id
  ) THEN
    RAISE EXCEPTION 'Notification was created for a request without a user_id';
  END IF;
END;
$phase1_event_test$;

-- Prove fail-open behaviour: a downstream projection insert failure must not
-- prevent the source service-request status update from committing.
CREATE OR REPLACE FUNCTION public.ils_test_force_projection_failure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'intentional disposable test failure';
END;
$$;
CREATE TRIGGER trg_ils_test_force_projection_failure
BEFORE INSERT ON public.ils_notification_customer_projection
FOR EACH ROW EXECUTE FUNCTION public.ils_test_force_projection_failure();

INSERT INTO public.service_requests(id,user_id,status,details)
VALUES ('44444444-4444-4444-8444-444444444444',
        '80b895a6-476e-459e-869d-f52dde18792b','pending','{}'::jsonb);
UPDATE public.service_requests
SET status='in_progress'
WHERE id='44444444-4444-4444-8444-444444444444';
DO $fail_open_assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id='44444444-4444-4444-8444-444444444444' AND status='in_progress'
  ) THEN
    RAISE EXCEPTION 'Notification failure blocked service-request status update';
  END IF;
END;
$fail_open_assert$;
DROP TRIGGER trg_ils_test_force_projection_failure ON public.ils_notification_customer_projection;
DROP FUNCTION public.ils_test_force_projection_failure();

-- Verify owner-only RLS with simulated authenticated JWT subjects.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','80b895a6-476e-459e-869d-f52dde18792b',true);
DO $owner_rls$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.ils_notification_customer_projection
  WHERE source_record_id='22222222-2222-4222-8222-222222222222';
  IF v_count <> 4 THEN RAISE EXCEPTION 'Owner should see 4 rows, got %',v_count; END IF;
END;
$owner_rls$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a871e397-8d77-49cb-ad66-8c4951286d5d',true);
DO $other_user_rls$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.ils_notification_customer_projection
  WHERE source_record_id='22222222-2222-4222-8222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated user saw % rows',v_count; END IF;
END;
$other_user_rls$;
COMMIT;

DO $privilege_assert$
BEGIN
  IF has_table_privilege('anon','public.ils_notification_customer_projection','SELECT')
     OR has_table_privilege('anon','public.ils_notification_customer_projection','INSERT') THEN
    RAISE EXCEPTION 'anon has unintended projection privileges';
  END IF;
  IF NOT has_table_privilege('authenticated','public.ils_notification_customer_projection','SELECT')
     OR has_table_privilege('authenticated','public.ils_notification_customer_projection','INSERT')
     OR has_table_privilege('authenticated','public.ils_notification_customer_projection','UPDATE')
     OR has_table_privilege('authenticated','public.ils_notification_customer_projection','DELETE') THEN
    RAISE EXCEPTION 'authenticated projection privileges are not read-only';
  END IF;
  IF NOT has_table_privilege('service_role','public.ils_notification_customer_projection','INSERT') THEN
    RAISE EXCEPTION 'service_role cannot insert projection rows';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ils_notification_customer_projection'::regclass) THEN
    RAISE EXCEPTION 'Projection RLS is not enabled';
  END IF;
END;
$privilege_assert$;

SELECT 'PASS: exact Phase-1 migration executed; lifecycle whitelist, dedupe, null-recipient skip, fail-open trigger, owner RLS, and grants verified.' AS result;
