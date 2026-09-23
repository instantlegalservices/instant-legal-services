-- Catalog-only validation. Do not CALL invoke or promote functions.

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS result,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
       p.proacl::text AS acl,
       r.rolname AS owner,
       (p.prosrc ILIKE '%odqebkdzkjfxzyzbrndt%') AS mentions_prod_ref,
       (p.proname ILIKE '%invoke%edge%function%') AS gap_name_match
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ils_invoke_edge_function_customer_action_e2e_real_v4',
    'ils_evidence_promote_verified',
    'ils_e2e_evidence_promote_verified'
  )
ORDER BY p.proname, args;
