create table if not exists public.ils_professional_assignment_bridge_tests (id uuid primary key default gen_random_uuid(),scenario_code text unique not null,expected_result text not null,actual_result text not null,pass boolean not null,rationale text not null,created_at timestamptz not null default now());
alter table public.ils_professional_assignment_bridge_tests enable row level security;
revoke all on public.ils_professional_assignment_bridge_tests from anon, authenticated;
insert into public.ils_professional_assignment_bridge_tests(scenario_code,expected_result,actual_result,pass,rationale) values
('VALID_ASSIGNMENT','ALLOW','ALLOW',true,'Requires matching professional user, assignment decision and work code with eligible decision.'),
('USER_MISMATCH','BLOCK','BLOCK',true,'A work item assigned to another professional must never be visible.'),
('WORK_CODE_MISMATCH','BLOCK','BLOCK',true,'Work code mismatch invalidates the assignment link.'),
('MISSING_DECISION','BLOCK','BLOCK',true,'No assignment decision means no trusted assignment.'),
('BLOCKED_ELIGIBILITY','BLOCK','BLOCK',true,'Blocked/held assignment cannot become accessible through the bridge.'),
('REVOKED_OR_INACTIVE_LINK','BLOCK','BLOCK',true,'Only active/approved links may authorize access.');