-- Private client matter tables are accessed by authenticated Admin UI,
-- SECURITY DEFINER client-portal RPCs, and service-role Edge Functions.
-- Anonymous direct table privileges are unnecessary. RLS does not protect TRUNCATE.
-- Preserve authenticated and service_role grants; do not change RLS policies or data.

DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_privilege text;
  v_relation regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'advocate_assignments',
    'client_work_progress',
    'client_chat_messages',
    'client_matter_documents'
  ] LOOP
    v_relation := to_regclass(format('public.%I', v_table));
    IF v_relation IS NULL THEN
      RAISE EXCEPTION 'Required private client table public.% is missing; refusing partial hardening', v_table;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, PUBLIC',
      v_table
    );

    -- Table-level REVOKE does not remove independently granted column ACLs.
    FOR v_column IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
    LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
        EXECUTE format(
          'REVOKE %s (%I) ON TABLE public.%I FROM anon, PUBLIC',
          v_privilege,
          v_column,
          v_table
        );
      END LOOP;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege('anon', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'anon retains % on public.%', v_privilege, v_table;
      END IF;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege('anon', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'anon retains column-level % on public.%', v_privilege, v_table;
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
