-- Phase 8G: TEST-only synthetic Professional A auth identity support
create table if not exists public.ils_test_synthetic_professional_auth_provisioning (
  id uuid primary key default gen_random_uuid(),
  synthetic_code text not null unique,
  request_id uuid not null unique references public.ils_test_synthetic_user_provision_requests(id) on delete restrict,
  auth_user_id uuid unique,
  operator_user_id uuid,
  status text not null default 'PREPARED',
  trust_profile_created boolean not null default false,
  capability_created boolean not null default false,
  provenance_class text not null default 'SYNTHETIC_TEST',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ils_test_synthetic_professional_auth_provisioning enable row level security;

create table if not exists public.ils_test_synthetic_professional_auth_handoffs (
  id uuid primary key default gen_random_uuid(),
  professional_auth_provisioning_id uuid not null references public.ils_test_synthetic_professional_auth_provisioning(id) on delete restrict,
  auth_user_id uuid not null,
  operator_user_id uuid not null,
  correlation_id uuid not null unique,
  status text not null default 'ISSUED',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.ils_test_synthetic_professional_auth_handoffs enable row level security;

create index if not exists ils_test_prof_auth_handoffs_active_idx
on public.ils_test_synthetic_professional_auth_handoffs(auth_user_id,status,expires_at);