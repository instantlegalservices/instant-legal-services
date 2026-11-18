-- TEST-only corrective migration for customer-action real-auth evidence invoke bridge.
-- The Supabase API gateway requires an apikey header on outbound Edge Function requests.
-- This is the TEST project's publishable key (public identifier, not a secret).
-- No Production endpoint or gate promotion is involved.
DO $migration$
DECLARE
  v_definition text;
  v_old text := E'extensions.http_header(''Authorization'', ''Bearer '' || trim(p_user_jwt)),\n      extensions.http_header(''Content-Type'', ''application/json'')';
  v_new text := E'extensions.http_header(''Authorization'', ''Bearer '' || trim(p_user_jwt)),\n      extensions.http_header(''apikey'', ''sb_publishable_eTuM4uU9TG_BqNvrcOd7cg_HWvk-Gl2''),\n      extensions.http_header(''Content-Type'', ''application/json'')';
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.ils_invoke_edge_function_customer_action_e2e_real_v4(text,text,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_matches := length(v_definition) - length(replace(v_definition, v_old, ''));
  IF v_matches = 0 OR v_matches / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one outbound header block in TEST invoke function; refusing migration';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;
