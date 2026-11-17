-- Remove anonymous access to existing public-schema sequences and stop
-- broad privileges from being inherited by future objects created by the
-- two roles observed in Production as public-schema object creators.
-- Existing table/function privileges are not changed by ALTER DEFAULT PRIVILEGES.
-- Existing public table/function access is handled by the separately reviewed PRs.

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $verify$
DECLARE
  v_sequence record;
BEGIN
  FOR v_sequence IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  LOOP
    IF has_sequence_privilege('anon', v_sequence.oid, 'USAGE')
       OR has_sequence_privilege('anon', v_sequence.oid, 'SELECT')
       OR has_sequence_privilege('anon', v_sequence.oid, 'UPDATE') THEN
      RAISE EXCEPTION 'anon retains sequence privilege on %.%', v_sequence.nspname, v_sequence.relname;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole IN ('postgres'::regrole, 'supabase_admin'::regrole)
      AND (
        (d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype IN ('r', 'S', 'f'))
        OR (d.defaclnamespace = 0 AND d.defaclobjtype = 'f')
      )
      AND (
        (a.grantee = 'anon'::regrole)
        OR (a.grantee = 0 AND d.defaclobjtype = 'f')
      )
      AND (
        (d.defaclobjtype = 'r' AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
        OR (d.defaclobjtype = 'S' AND a.privilege_type IN ('USAGE','SELECT','UPDATE'))
        OR (d.defaclobjtype = 'f' AND a.privilege_type = 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Anonymous or PUBLIC privileges remain in public-schema future-object defaults';
  END IF;
END
$verify$;
