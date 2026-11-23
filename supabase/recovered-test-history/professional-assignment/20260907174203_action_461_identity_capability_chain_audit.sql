create table if not exists public.ils_professional_identity_capability_audit (id uuid primary key default gen_random_uuid(), check_code text not null unique, subject text not null, expected_chain text not null, decision text not null, rationale text not null, created_at timestamptz not null default now());
insert into public.ils_professional_identity_capability_audit(check_code,subject,expected_chain,decision,rationale) values
('IDENTITY_AUTH','associate/professional','auth.users → associate application user_id','PASS_STRUCTURE','Associate applications have user_id; runtime identity verification still required.'),
('CAPABILITY_LINK','associate/professional','user_id → associate_capabilities','PASS_STRUCTURE','Capabilities are explicitly linked to user_id and carry status/verified_at.'),
('TRUST_LINK','associate/professional','user_id → associate_trust_profiles','PASS_STRUCTURE','Trust profile contains identity/qualification/registration/capability verification flags.'),
('ROLE_GATE','assignment','role_code → capability_code → gate','PASS_STRUCTURE','Role catalog, capability matrix and capability gates provide structured eligibility controls.'),
('WORK_GATE','work','work_code → required_capabilities → user allocation','PASS_STRUCTURE','Work capability requirements and allocation decisions exist.'),
('PROF_ASSIGNMENT','professional_work','professional_user_id → assigned work item','HOLD','Exact capability+role+assignment runtime join must be enforced before customer-sensitive professional SELECT policies.'),
('B2B_ASSIGNMENT','b2b_work','professional_user_id → matter/work item','HOLD','Matter ownership and professional assignment must be joined before exposing client data.'),
('VERIFICATION_STATE','verification','identity/qualification/registration/capability','HOLD','Database fields exist but no universal single verified-active predicate was established safely.'),
('AUTH_E2E','runtime','auth.uid() → verified professional identity','HOLD','No authenticated impersonation/session E2E test has been executed by available tooling.')
on conflict(check_code) do update set expected_chain=excluded.expected_chain,decision=excluded.decision,rationale=excluded.rationale,created_at=now();
revoke all on table public.ils_professional_identity_capability_audit from anon,authenticated;
alter table public.ils_professional_identity_capability_audit enable row level security;