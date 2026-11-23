\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO service_role;

\i supabase/migrations/20261117063714_ils_ai_rate_limit_shared.sql

DO $privileges$
BEGIN
  IF has_table_privilege('anon','public.ils_ai_rate_limits','SELECT')
     OR has_table_privilege('anon','public.ils_ai_rate_limits','INSERT')
     OR has_table_privilege('authenticated','public.ils_ai_rate_limits','SELECT') THEN
    RAISE EXCEPTION 'non-service roles have access to rate-limit storage';
  END IF;
  IF NOT has_table_privilege('service_role','public.ils_ai_rate_limits','SELECT')
     OR NOT has_table_privilege('service_role','public.ils_ai_rate_limits','INSERT')
     OR NOT has_table_privilege('service_role','public.ils_ai_rate_limits','UPDATE')
     OR NOT has_table_privilege('service_role','public.ils_ai_rate_limits','DELETE') THEN
    RAISE EXCEPTION 'service_role is missing rate-limit storage privileges';
  END IF;
  IF has_function_privilege('anon','public.ils_ai_rate_limit_check(text, integer, integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.ils_ai_rate_limit_check(text, integer, integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ils_ai_rate_limit_check(text, integer, integer)','EXECUTE') THEN
    RAISE EXCEPTION 'rate-limit RPC execute grants are incorrect';
  END IF;
END
$privileges$;

SET ROLE service_role;
DO $behavior$
DECLARE
  v_result jsonb;
  v_count bigint;
BEGIN
  v_result := public.ils_ai_rate_limit_check(repeat('a',64),2,60);
  IF (v_result->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'first request should pass'; END IF;
  v_result := public.ils_ai_rate_limit_check(repeat('a',64),2,60);
  IF (v_result->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'second request should pass'; END IF;
  v_result := public.ils_ai_rate_limit_check(repeat('a',64),2,60);
  IF (v_result->>'allowed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'third request should be limited'; END IF;

  UPDATE public.ils_ai_rate_limits
     SET window_started_at = clock_timestamp() - interval '61 seconds'
   WHERE key_hash = repeat('a',64) AND window_seconds = 60;
  v_result := public.ils_ai_rate_limit_check(repeat('a',64),2,60);
  IF (v_result->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'expired window should reset'; END IF;
  SELECT request_count INTO v_count FROM public.ils_ai_rate_limits
   WHERE key_hash = repeat('a',64) AND window_seconds = 60;
  IF v_count <> 1 THEN RAISE EXCEPTION 'expired window did not reset counter: %', v_count; END IF;

  BEGIN
    PERFORM public.ils_ai_rate_limit_check(repeat('b',64),0,60);
    RAISE EXCEPTION 'invalid limit was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END
$behavior$;
RESET ROLE;

DELETE FROM public.ils_ai_rate_limits WHERE key_hash = repeat('c',64);
\echo PASS: migration grants, rate-limit thresholds, expiry reset and invalid-input rejection verified on PostgreSQL 16.
