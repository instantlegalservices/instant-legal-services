-- Tighten anonymous privileges while retaining only the intentional public path:
-- judgments: public SELECT remains available behind the verified + completed RLS policy.
-- Advocate registration is handled by the register-advocate Edge Function using
-- a service-role client; anonymous direct table INSERT is not required.
-- Private profile, research, customer profile and tool-run tables receive no anon grants.
-- No policies, authenticated/service_role grants, or table data are changed.

DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_privilege text;
  v_relation regclass;
  v_expected_select boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'advocate_registrations',
    'advocate_research_documents',
    'customer_profiles',
    'judgments',
    'tool_runs'
  ] LOOP
    v_relation := to_regclass(format('public.%I', v_table));
    IF v_relation IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing; refusing partial hardening', v_table;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, PUBLIC',
      v_table
    );

    -- Remove any column-specific grants before restoring only public judgment SELECT.
    FOR v_column IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
    LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
        EXECUTE format(
          'REVOKE %s (%I) ON TABLE public.%I FROM anon, PUBLIC',
          v_privilege, v_column, v_table
        );
      END LOOP;
    END LOOP;

    v_expected_select := (v_table = 'judgments');

    IF v_expected_select THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', v_table);
    END IF;

    IF has_table_privilege('anon', v_relation, 'SELECT') <> v_expected_select THEN
      RAISE EXCEPTION 'Unexpected anon SELECT privilege on public.%', v_table;
    END IF;
    IF has_table_privilege('anon', v_relation, 'INSERT') THEN
      RAISE EXCEPTION 'anon retains INSERT on public.%', v_table;
    END IF;

    FOREACH v_privilege IN ARRAY ARRAY[
      'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege('anon', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'anon retains % on public.%', v_privilege, v_table;
      END IF;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege('anon', v_relation, v_privilege) THEN
        -- Table-level SELECT on judgments also satisfies has_any_column_privilege.
        IF NOT (v_table = 'judgments' AND v_privilege = 'SELECT') THEN
          RAISE EXCEPTION 'anon retains unexpected column-level % on public.%', v_privilege, v_table;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
