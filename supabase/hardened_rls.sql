-- ILS V9 FINAL HARDENED SECURITY MIGRATION
-- Run in Supabase SQL Editor BEFORE production deployment.
-- This migration intentionally uses an admin allow-list table instead of treating every
-- authenticated user as an administrator.

create table if not exists public.ils_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.ils_admin_users enable row level security;
revoke all on public.ils_admin_users from anon, authenticated;

create or replace function public.ils_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.ils_admin_users where user_id = auth.uid());
$$;
revoke all on function public.ils_is_admin() from public;
grant execute on function public.ils_is_admin() to anon, authenticated;

-- Seed the existing ILS admin login email already used by the supplied working portal.
do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email)=lower('fahat29@gmail.com') limit 1;
  if uid is not null then
    insert into public.ils_admin_users(user_id,email) values(uid,'fahat29@gmail.com') on conflict(user_id) do update set email=excluded.email;
  end if;
end $$;

-- Enable RLS on sensitive tables.
alter table public.client_requirements enable row level security;
alter table public.advocate_registrations enable row level security;
alter table public.advocate_assignments enable row level security;
alter table public.client_chat_messages enable row level security;
alter table public.client_matter_documents enable row level security;
alter table public.client_work_progress enable row level security;
alter table public.judgments enable row level security;
alter table public.judgment_sources enable row level security;
alter table public.judgment_fetch_logs enable row level security;

-- Remove legacy broad policies on the sensitive base tables. SECURITY DEFINER RPCs remain
-- the controlled path for client/advocate portal operations.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('client_requirements','advocate_registrations','advocate_assignments','client_chat_messages','client_matter_documents','client_work_progress','judgments','judgment_sources','judgment_fetch_logs') loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

-- ADMIN: full CRM access.
create policy ils_admin_client_requirements_all on public.client_requirements for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_public_client_requirements_insert on public.client_requirements for insert to anon, authenticated with check (length(trim(client_name)) between 1 and 100 and mobile ~ '^[0-9]{10}$' and length(trim(brief_requirement)) between 1 and 3000);

create policy ils_admin_advocate_registrations_all on public.advocate_registrations for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());

create policy ils_admin_assignments_all on public.advocate_assignments for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_admin_chat_all on public.client_chat_messages for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_admin_documents_all on public.client_matter_documents for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_admin_progress_all on public.client_work_progress for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());

-- Public judgments: VERIFIED + COMPLETED only. Nothing pending/processing is public.
create policy ils_public_verified_judgments_select on public.judgments for select to anon, authenticated using (is_verified = true and lower(coalesce(summary_status,''))='completed');
create policy ils_admin_judgments_all on public.judgments for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_admin_judgment_sources_all on public.judgment_sources for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
create policy ils_admin_judgment_logs_all on public.judgment_fetch_logs for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());

-- Keep public advocate directory exposed only through the existing sanitized view.
-- Do NOT grant direct SELECT on advocate_registrations to public/authenticated.

-- Verification helpers: after running this migration, test both positive and negative cases.
-- Admin:  select public.ils_is_admin();
-- Anonymous/public: must not be able to SELECT client_requirements or advocate_registrations.
-- Public: may SELECT only verified/completed judgments and the sanitized advocate directory view.
