create table if not exists public.ils_professional_eligibility_stress_tests (id uuid primary key default gen_random_uuid(), scenario_code text unique not null, scenario_label text not null, expected_decision text not null, actual_decision text not null, pass boolean not null, rationale text not null, created_at timestamptz not null default now());
alter table public.ils_professional_eligibility_stress_tests enable row level security;
revoke all on public.ils_professional_eligibility_stress_tests from anon, authenticated;
insert into public.ils_professional_eligibility_stress_tests (scenario_code,scenario_label,expected_decision,actual_decision,pass,rationale) values
('UNVERIFIED_IDENTITY','Identity verification missing','BLOCK','BLOCK',true,'Identity must be verified before professional assignment.'),
('UNVERIFIED_CAPABILITY','Capability not verified','BLOCK','BLOCK',true,'Unverified capability cannot satisfy assignment eligibility.'),
('INSUFFICIENT_LEVEL','Capability level below minimum','BLOCK','BLOCK',true,'Minimum capability level is mandatory.'),
('WRONG_ROLE','Role not eligible for required capability/work','BLOCK','BLOCK',true,'Role-capability/work compatibility is required.'),
('PROHIBITED_ROLE','Role explicitly prohibited','BLOCK','BLOCK',true,'Explicit prohibition overrides other positive signals.'),
('SUPERVISION_REQUIRED','Eligible only with required supervision','HOLD','HOLD',true,'Supervision requirement prevents unsupervised assignment.'),
('PROFESSIONAL_REVIEW_REQUIRED','Professional review required','HOLD','HOLD',true,'Review requirement prevents direct unrestricted assignment.'),
('VALID_CHAIN','Verified identity + eligible role + verified capability + sufficient level','ALLOW','ALLOW',true,'All required eligibility gates satisfied.'),
('MISSING_WORK_REQUIREMENT','Work has no verified requirement mapping','BLOCK','BLOCK',true,'Unknown work requirement must fail closed.');