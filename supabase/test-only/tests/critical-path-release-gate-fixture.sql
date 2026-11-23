-- Disposable PostgreSQL fixture for the TEST-only release-gate SQL policy test.
-- This is isolated CI data, never a Supabase migration or production schema seed.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE TABLE public.ils_critical_path_release_proof_hostile_tests (
  id uuid PRIMARY KEY,
  test_code text UNIQUE NOT NULL,
  attack_class text NOT NULL,
  expected_decision text NOT NULL
);
CREATE TABLE public.ils_critical_path_release_proof_hostile_results (
  id uuid PRIMARY KEY,
  test_id uuid UNIQUE NOT NULL,
  actual_decision text NOT NULL,
  passed boolean NOT NULL,
  destructive_attempted boolean NOT NULL,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gov_service_routes (
  id uuid PRIMARY KEY,
  route_status text NOT NULL,
  official_domain text NOT NULL
);
CREATE TABLE public.gov_route_verification_snapshots (
  id uuid PRIMARY KEY,
  route_id uuid NOT NULL,
  checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL,
  checked_by uuid,
  http_status integer,
  official_domain_match boolean,
  service_identity_match boolean,
  geography_match boolean,
  authority_match boolean,
  https_ok boolean,
  final_url text,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_check_at timestamptz
);

CREATE TABLE public.ils_release_critical_path_inventory (
  id uuid PRIMARY KEY,
  path_code text NOT NULL UNIQUE,
  release_required boolean NOT NULL
);
CREATE TABLE public.ils_critical_path_evidence_contracts (
  critical_path_code text PRIMARY KEY,
  expected_provenance text NOT NULL,
  expected_source_pattern text NOT NULL,
  expected_function_pattern text NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_critical_path_evidence_registry (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL,
  critical_path_code text NOT NULL,
  binding_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_e2e_evidence (
  id uuid PRIMARY KEY,
  evidence_class text,
  provenance_class text,
  source_type text,
  authenticated_user_id uuid,
  invocation_correlation_id text,
  function_slug text,
  function_version integer,
  function_sha256 text,
  details text,
  critical_path_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_e2e_function_deployment_registry (
  function_slug text NOT NULL,
  function_version integer NOT NULL,
  deployment_sha256 text NOT NULL,
  critical_path_code text NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_e2e_historical_event_quarantine (
  evidence_id uuid PRIMARY KEY
);
CREATE TABLE public.ils_notification_e2e_preflight (
  id uuid PRIMARY KEY,
  path_code text NOT NULL,
  status text,
  synthetic_only boolean,
  real_recipient_data_allowed boolean,
  real_message_send_allowed boolean,
  customer_data_allowed boolean,
  authorization_level text,
  real_external_delivery_allowed boolean,
  external_provider_invocation_allowed boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ils_document_e2e_release_gate_decisions (
  id uuid PRIMARY KEY,
  decision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_notification_e2e_release_gate_decisions (
  id uuid PRIMARY KEY,
  decision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_professional_assignment_e2e_release_gate_decisions (
  id uuid PRIMARY KEY,
  decision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_security_execution_e2e_release_gate_decisions (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_critical_path_evidence_binding_integrity_audit (
  id uuid PRIMARY KEY,
  decision text NOT NULL,
  orphan_registry_rows integer NOT NULL,
  duplicate_evidence_bindings integer NOT NULL,
  cross_path_conflicts integer NOT NULL,
  orphan_evidence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_critical_path_release_proof_runs (
  id uuid PRIMARY KEY,
  decision text NOT NULL,
  total_paths integer NOT NULL,
  passed_paths integer NOT NULL,
  held_paths integer NOT NULL,
  failed_paths integer NOT NULL,
  destructive_attempts integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_e2e_release_gate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_code text NOT NULL,
  decision text NOT NULL,
  verified_count integer NOT NULL,
  simulated_count integer NOT NULL,
  unverified_count integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.ils_canonical_verified_evidence_count(p_path text)
RETURNS integer LANGUAGE sql STABLE AS $fn$
  SELECT 0;
$fn$;

INSERT INTO public.ils_release_critical_path_inventory(id,path_code,release_required)
SELECT gen_random_uuid(),p,true
FROM unnest(ARRAY[
  'CUSTOMER_ACTION_E2E','DOCUMENT_E2E','GOV_ROUTE_E2E','NOTIFICATION_E2E',
  'PAYMENT_E2E','PROFESSIONAL_ASSIGNMENT_E2E','RELEASE_E2E','SECURITY_EXECUTION_E2E'
]) AS p;

INSERT INTO public.ils_critical_path_evidence_contracts(
  critical_path_code,expected_provenance,expected_source_pattern,expected_function_pattern,active
)
SELECT p,'REAL_AUTHENTICATED','real','e2e',true
FROM unnest(ARRAY[
  'CUSTOMER_ACTION_E2E','DOCUMENT_E2E','GOV_ROUTE_E2E','NOTIFICATION_E2E',
  'PAYMENT_E2E','PROFESSIONAL_ASSIGNMENT_E2E','RELEASE_E2E','SECURITY_EXECUTION_E2E'
]) AS p;

CREATE TABLE public.ils_document_e2e_harness_runs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_notification_e2e_harness_runs (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);
CREATE TABLE public.ils_professional_assignment_e2e_harness_runs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ils_security_execution_e2e_hostile_runs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ils_critical_path_release_proof_hostile_tests
  (id,test_code,attack_class,expected_decision)
SELECT gen_random_uuid(),code,code,'BLOCK'
FROM unnest(ARRAY[
  'CP_RELEASE_REPLAY','CP_RELEASE_CROSS_PATH_RACE','CP_RELEASE_DUPLICATE_BIND',
  'CP_RELEASE_CONCURRENT_PROMOTION','CP_RELEASE_STALE_CONTRACT',
  'CP_RELEASE_REVOKED_BINDING','CP_RELEASE_SYNTHETIC_RACE',
  'CP_RELEASE_MISSING_PROVENANCE_RACE'
]) AS code;
