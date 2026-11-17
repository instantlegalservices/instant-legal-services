-- Keep only public read access for active route/service/tool catalogues.
-- Private queue, judgment-source/log metadata and professional applications
-- must remain accessible only through authenticated Admin or trusted service-role paths.
-- Preserve authenticated/service_role grants, all RLS policies, and data.

DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_privilege text;
  v_relation regclass;
  v_public_select boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'ils_action_assistance_queue',
    'ils_government_route_catalog',
    'judgment_fetch_logs',
    'judgment_sources',
    'professional_join_requests',
    'services',
    'service_prices',
    'tool_catalog'
  ] LOOP
    v_relation := to_regclass(format('public.%I', v_table));
    IF v_relation IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing; refusing partial hardening', v_table;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, PUBLIC',
      v_table
    );

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

    v_public_select := v_table IN (
      'ils_government_route_catalog',
      'services',
      'service_prices',
      'tool_catalog'
    );

    IF v_public_select THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', v_table);
    END IF;

    IF has_table_privilege('anon', v_relation, 'SELECT') <> v_public_select THEN
      RAISE EXCEPTION 'Unexpected anon SELECT privilege on public.%', v_table;
    END IF;

    FOREACH v_privilege IN ARRAY ARRAY[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege('anon', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'anon retains % on public.%', v_privilege, v_table;
      END IF;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege('anon', v_relation, v_privilege) THEN
        IF NOT (v_public_select AND v_privilege = 'SELECT') THEN
          RAISE EXCEPTION 'anon retains unexpected column-level % on public.%', v_privilege, v_table;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
