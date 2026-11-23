\set ON_ERROR_STOP on
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

CREATE TABLE public.ils_test_synthetic_provision_operators(
 operator_user_id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_test_synthetic_auth_handoffs(
 id uuid PRIMARY KEY, synthetic_user_id uuid NOT NULL, operator_user_id uuid NOT NULL,
 status text NOT NULL, expires_at timestamptz NOT NULL, token_hash_sha256 text,
 consumed_at timestamptz
);

\i supabase/test-only/20261123004000_atomic_synthetic_handoff_consume.sql

DO $privileges$
BEGIN
 IF has_function_privilege('anon','public.ils_test_consume_synthetic_auth_handoff(uuid,uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.ils_test_consume_synthetic_auth_handoff(uuid,uuid,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.ils_test_consume_synthetic_auth_handoff(uuid,uuid,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Atomic consume RPC grants are incorrect';
 END IF;
END
$privileges$;

INSERT INTO public.ils_test_synthetic_provision_operators(operator_user_id,role,active)
VALUES
 ('10000000-0000-0000-0000-000000000001','TEST_PROVISION_OPERATOR',true),
 ('10000000-0000-0000-0000-000000000002','TEST_PROVISION_OPERATOR',false),
 ('10000000-0000-0000-0000-000000000003','OTHER_ROLE',true);

INSERT INTO public.ils_test_synthetic_auth_handoffs(id,synthetic_user_id,operator_user_id,status,expires_at,token_hash_sha256)
VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','ISSUED',now()+interval '10 minutes',repeat('a',64)),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','ISSUED',now()+interval '10 minutes',repeat('b',64)),
 ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','ISSUED',now()+interval '10 minutes',repeat('c',64)),
 ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','ISSUED',now()+interval '10 minutes',repeat('d',64));

SET ROLE service_role;
DO $negative$
BEGIN
 IF public.ils_test_consume_synthetic_auth_handoff(
   '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',repeat('f',64)) THEN
   RAISE EXCEPTION 'wrong token digest consumed handoff';
 END IF;
 IF public.ils_test_consume_synthetic_auth_handoff(
   '20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',repeat('b',64)) THEN
   RAISE EXCEPTION 'inactive operator consumed handoff';
 END IF;
 IF public.ils_test_consume_synthetic_auth_handoff(
   '20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',repeat('c',64)) THEN
   RAISE EXCEPTION 'wrong operator role consumed handoff';
 END IF;
 IF (SELECT status FROM public.ils_test_synthetic_auth_handoffs WHERE id='20000000-0000-0000-0000-000000000001') <> 'ISSUED'
    OR (SELECT status FROM public.ils_test_synthetic_auth_handoffs WHERE id='20000000-0000-0000-0000-000000000002') <> 'ISSUED'
    OR (SELECT status FROM public.ils_test_synthetic_auth_handoffs WHERE id='20000000-0000-0000-0000-000000000003') <> 'ISSUED' THEN
   RAISE EXCEPTION 'Denied handoff attempts must leave the handoff ISSUED';
 END IF;
END
$negative$;
RESET ROLE;

\echo PASS: operator-active and exact-token checks deny unauthorized handoff consumption; service_role is the only RPC caller.
