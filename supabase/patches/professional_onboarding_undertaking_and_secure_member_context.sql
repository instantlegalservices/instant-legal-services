-- ILS professional onboarding hardening
-- Applied in Supabase production as:
-- professional_onboarding_undertaking_and_secure_member_context
--
-- Safe additive migration. Existing public directory, payment and CRM chains remain unchanged.

alter table public.advocate_registrations
  add column if not exists undertaking_accepted boolean not null default false;

alter table public.advocate_registrations
  add column if not exists undertaking_signed_name text;

alter table public.advocate_registrations
  add column if not exists undertaking_signed_at timestamptz;

create index if not exists advocate_registrations_auth_user_id_idx
  on public.advocate_registrations(auth_user_id);

create index if not exists professional_join_requests_auth_user_id_idx
  on public.professional_join_requests(auth_user_id);

alter table public.professional_join_requests enable row level security;

drop policy if exists ils_admin_professional_join_requests_all on public.professional_join_requests;

create policy ils_admin_professional_join_requests_all
  on public.professional_join_requests
  for all to authenticated
  using (public.ils_is_admin())
  with check (public.ils_is_admin());

create or replace function public.ils_professional_member_context()
returns table(is_member boolean, profession text)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  caller_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  app_profession text := lower(trim(coalesce(auth.jwt()->'app_metadata'->>'profession','')));
  joined_profession text;
begin
  if uid is null then
    return query select false, null::text;
    return;
  end if;

  select lower(trim(p.professional_type))
    into joined_profession
  from public.professional_join_requests p
  where (p.auth_user_id = uid or lower(p.email) = caller_email)
    and lower(coalesce(p.status,'pending')) not in ('rejected','cancelled')
  order by p.created_at desc
  limit 1;

  if joined_profession in ('ca','cs','hr','gst_practitioner','assistant_associate') then
    return query select true, joined_profession;
    return;
  end if;

  if exists (
    select 1
    from public.advocate_registrations ar
    where (ar.auth_user_id = uid or lower(ar.email) = caller_email)
      and lower(coalesce(ar.status,'pending')) not in ('rejected','cancelled')
  ) then
    return query select true, 'advocate'::text;
    return;
  end if;

  -- Auth metadata is only a compatibility hint; it never grants access alone.
  if app_profession in ('ca','cs','hr','gst_practitioner','assistant_associate','advocate') then
    return query select false, null::text;
    return;
  end if;

  return query select false, null::text;
end;
$$;

revoke all on function public.ils_professional_member_context() from public;
grant execute on function public.ils_professional_member_context() to authenticated;
