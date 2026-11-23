\set ON_ERROR_STOP on
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.ils_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.is_admin',true),'false')='true' $$;

CREATE TABLE public.orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 service_request_id uuid, total numeric NOT NULL, currency text NOT NULL DEFAULT 'INR',
 status text NOT NULL DEFAULT 'pending', order_number text NOT NULL UNIQUE
);
CREATE TABLE public.service_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 service_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.order_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL,
 service_id uuid NOT NULL
);
CREATE TABLE public.payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL,
 gateway text NOT NULL, status text NOT NULL, gateway_order_id text
);
CREATE TABLE public.payment_proofs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL,
 user_id uuid NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
 upi_id text NOT NULL, transaction_ref text NOT NULL,
 payee_name_claimed text, screenshot_path text NOT NULL,
 screenshot_sha256 text NOT NULL, mime_type text NOT NULL, file_size_bytes integer NOT NULL,
 status text NOT NULL DEFAULT 'pending', verification_notes text,
 submitted_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz, verified_by uuid
);
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
 owner uuid, owner_id text, archived_at timestamptz, is_delete_marker boolean DEFAULT false,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(bucket_id,name)
);
CREATE TABLE public.entitlements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 service_id uuid NOT NULL, order_id uuid NOT NULL, status text NOT NULL,
 starts_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX entitlements_user_service_order_uidx
 ON public.entitlements(user_id,service_id,order_id);

-- Seed broad legacy grants so the migration must remove explicit and PUBLIC write access.
GRANT ALL PRIVILEGES ON TABLE public.payment_proofs TO anon,authenticated,PUBLIC;
GRANT INSERT (transaction_ref), UPDATE (status) ON TABLE public.payment_proofs TO anon,authenticated;
GRANT SELECT ON TABLE public.payment_proofs TO authenticated;

INSERT INTO public.service_requests(id,user_id,service_id,status)
VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','pending'),
       ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','pending'),
       ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','pending');
INSERT INTO public.orders(id,user_id,service_request_id,total,currency,status,order_number)
VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',100,'INR','pending','UPI-CI-1'),
       ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',100,'INR','pending','UPI-CI-2'),
       ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',100,'INR','pending','UPI-CI-3');
INSERT INTO public.order_items(order_id,service_id)
VALUES ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
       ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
       ('40000000-0000-0000-0000-000000000003','29999999-0000-0000-0000-000000000099');
INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)
VALUES ('payment-proofs','10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/proof.jpg','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{"size":"1024","mimetype":"image/jpeg"}'),
       ('payment-proofs','10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000002/proof.jpg','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{"size":"1024","mimetype":"image/jpeg"}'),
       ('payment-proofs','10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000003/proof.jpg','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{"size":"1024","mimetype":"image/jpeg"}');

\i supabase/migrations/20261118190000_harden_upi_payment_proof_flow.sql

DO $privileges$
DECLARE v_privilege text;
BEGIN
  FOREACH v_privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('anon','public.payment_proofs',v_privilege)
       OR has_table_privilege('authenticated','public.payment_proofs',v_privilege) THEN
      RAISE EXCEPTION 'direct table write privilege remains: %',v_privilege;
    END IF;
  END LOOP;
  IF has_any_column_privilege('anon','public.payment_proofs','INSERT')
     OR has_any_column_privilege('anon','public.payment_proofs','UPDATE')
     OR has_any_column_privilege('authenticated','public.payment_proofs','INSERT')
     OR has_any_column_privilege('authenticated','public.payment_proofs','UPDATE') THEN
    RAISE EXCEPTION 'direct column-level write privilege remains';
  END IF;
  IF NOT has_table_privilege('authenticated','public.payment_proofs','SELECT') THEN
    RAISE EXCEPTION 'authenticated SELECT access was not preserved';
  END IF;
  IF has_function_privilege('anon','public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'UPI submit RPC execute grants are incorrect';
  END IF;
END
$privileges$;

SET ROLE authenticated;
SELECT set_config('test.user_id','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.is_admin','false',false);
SELECT (public.ils_submit_upi_payment_proof(
 '40000000-0000-0000-0000-000000000001',100,'8445609837@axl','UTR-12345678','ILS TEST',
 '10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/proof.jpg',
 repeat('a',64),'image/jpeg',1024)->>'proof_id') AS first_proof_id \gset

DO $negative$
BEGIN
  BEGIN
    PERFORM public.ils_submit_upi_payment_proof(
      '40000000-0000-0000-0000-000000000002',100,'8445609837@axl','UTR12345678','ILS TEST',
      '10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000002/proof.jpg',
      repeat('b',64),'image/jpeg',1024);
    RAISE EXCEPTION 'cross-order duplicate UTR was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'TRANSACTION_REFERENCE_ALREADY_USED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.ils_submit_upi_payment_proof(
      '40000000-0000-0000-0000-000000000001',100,'8445609837@axl','UTR-12345678','ILS TEST',
      '10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/proof.jpg',
      repeat('c',64),'image/jpeg',1024);
    RAISE EXCEPTION 'duplicate pending proof was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'PROOF_ALREADY_PENDING' THEN RAISE; END IF;
  END;
END
$negative$;

SELECT set_config('test.is_admin','true',false);
SELECT public.ils_admin_verify_upi_payment_proof(:'first_proof_id'::uuid,'rejected','test rejection');
SELECT (public.ils_submit_upi_payment_proof(
 '40000000-0000-0000-0000-000000000001',100,'8445609837@axl','UTR-87654321','ILS TEST',
 '10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/proof.jpg',
 repeat('d',64),'image/jpeg',1024)->>'proof_id') AS second_proof_id \gset

SELECT set_config('test.is_admin','true',false);
SELECT public.ils_admin_verify_upi_payment_proof(:'second_proof_id'::uuid,'verified','test approval');
RESET ROLE;

DO $assert$
BEGIN
  IF (SELECT status FROM public.payment_proofs WHERE transaction_ref='UTR87654321') <> 'verified' THEN
    RAISE EXCEPTION 'proof not verified';
  END IF;
  IF (SELECT status FROM public.orders WHERE id='40000000-0000-0000-0000-000000000001') <> 'paid' THEN
    RAISE EXCEPTION 'order not paid';
  END IF;
  IF (SELECT status FROM public.service_requests WHERE id='30000000-0000-0000-0000-000000000001') <> 'paid' THEN
    RAISE EXCEPTION 'service request not paid';
  END IF;
  IF (SELECT count(*) FROM public.entitlements WHERE order_id='40000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'entitlement missing or duplicated';
  END IF;
END
$assert$;

\echo PASS: UPI proof privilege hardening, Storage ownership/metadata checks, UTR replay protection, rejection/resubmission and transactional Admin verification verified on PostgreSQL 16.
