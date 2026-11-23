create table if not exists public.ils_professional_access_boundary_audit (id uuid primary key default gen_random_uuid(), table_name text not null unique, access_rule text not null, decision text not null, rationale text not null, created_at timestamptz not null default now());
insert into public.ils_professional_access_boundary_audit(table_name,access_rule,decision,rationale) values
('ils_professional_work_items','professional_user_id = auth.uid()','HOLD_REVIEW','Professional may see only their assigned work item; exact product access contract must be implemented separately.'),
('ils_professional_work_events','event belongs to work item assigned to auth.uid()','HOLD_REVIEW','Event history must follow assigned work-item ownership.'),
('ils_b2b_work_items','professional_user_id = auth.uid()','HOLD_REVIEW','Assigned B2B work only; client/matter data must not become globally readable.'),
('ils_b2b_work_events','event belongs to assigned B2B work item','HOLD_REVIEW','Event visibility must inherit assignment boundary.'),
('ils_b2b_work_cards','card belongs to assigned B2B work item','HOLD_REVIEW','Work card may contain client-sensitive operational data.'),
('ils_b2b_matters','created_by/customer ownership or explicit assignment','LOCKDOWN','Matter contains business and financial information; do not expose to professionals solely by role.'),
('ils_professional_guide_access','professional_user_id = auth.uid()','HOLD_REVIEW','Guide access is professional-scoped but exact role/capability gate required.')
on conflict(table_name) do update set access_rule=excluded.access_rule,decision=excluded.decision,rationale=excluded.rationale,created_at=now();
revoke all on table public.ils_professional_access_boundary_audit from anon,authenticated;
alter table public.ils_professional_access_boundary_audit enable row level security;