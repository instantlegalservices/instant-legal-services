-- Tighten anonymous privileges while retaining the two intentionally public paths:
-- 1) advocate_registrations: public INSERT remains available behind its existing RLS validation policy.
-- 2) judgments: public SELECT remains available behind the verified + completed RLS policy.
-- All other target tables are private and receive no anon privileges.
-- No policies, authenticated/service_role grants, or table data are changed.

DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_privilege text;
  v_relation regclass;
  v_expected_select boolean;
  v_expected_insert boolean;
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

    -- Remove any column-specific grants before restoring only intentional table-level access.
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
    v_expected_insert := (v_table = 'advocate_registrations');

    IF v_expected_select THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', v_table);
    END IF;
    IF v_expected_insert THEN
      EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon', v_table);
    END IF;

    IF has_table_privilege('anon', v_relation, 'SELECT') <> v_expected_select THEN
      RAISE EXCEPTION 'Unexpected anon SELECT privilege on public.%', v_table;
    END IF;
    IF has_table_privilege('anon', v_relation, 'INSERT') <> v_expected_insert THEN
      RAISE EXCEPTION 'Unexpected anon INSERT privilege on public.%', v_table;
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
        -- Table-level grants also satisfy has_any_column_privilege; allow only the
        -- matching intentionally-public privilege on its corresponding table.
        IF NOT (v_table = 'judgments' AND v_privilege = 'SELECT')
           AND NOT (v_table = 'advocate_registrations' AND v_privilege = 'INSERT') THEN
          RAISE EXCEPTION 'anon retains unexpected column-level % on public.%', v_privilege, v_table;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
