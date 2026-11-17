-- Commerce and payment records are private to their authenticated owner,
-- Admins, or trusted service-role payment handlers.
-- Anonymous direct privileges are unnecessary and bypass no RLS policies.
-- Preserve authenticated/service_role grants and all existing policies/data.

DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_privilege text;
  v_relation regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'orders',
    'order_items',
    'payments',
    'payment_events',
    'payment_proofs',
    'entitlements',
    'service_requests'
  ] LOOP
    v_relation := to_regclass(format('public.%I', v_table));
    IF v_relation IS NULL THEN
      RAISE EXCEPTION 'Required private commerce table public.% is missing; refusing partial hardening', v_table;
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
