-- Bind professional-member lookup to the authenticated Supabase user first.
-- Email compatibility is allowed only when no profile is linked to this auth user,
-- and only against legacy rows whose auth_user_id is NULL.
-- Preserve current eligibility: Pending remains eligible; Rejected/Cancelled do not.

create or replace function public.ils_professional_member_context()
returns table(is_member boolean, profession text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  caller_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt()->>'email', '')));
  app_profession text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt()->'app_metadata'->>'profession', '')));
  joined_profession text;
  has_linked_professional_profile boolean;
  has_linked_advocate_profile boolean;
begin
  if uid is null then
    return query select false, null::text;
    return;
  end if;

  select exists (
    select 1 from public.professional_join_requests p
    where p.auth_user_id = uid
  ) into has_linked_professional_profile;

  if has_linked_professional_profile then
    select pg_catalog.lower(pg_catalog.btrim(p.professional_type))
      into joined_profession
    from public.professional_join_requests p
    where p.auth_user_id = uid
      and pg_catalog.lower(coalesce(p.status, 'pending')) not in ('rejected', 'cancelled')
    order by p.created_at desc
    limit 1;
  elsif caller_email <> '' then
    select pg_catalog.lower(pg_catalog.btrim(p.professional_type))
      into joined_profession
    from public.professional_join_requests p
    where p.auth_user_id is null
      and pg_catalog.lower(p.email) = caller_email
      and pg_catalog.lower(coalesce(p.status, 'pending')) not in ('rejected', 'cancelled')
    order by p.created_at desc
    limit 1;
  end if;

  if joined_profession in ('ca', 'cs', 'hr', 'gst_practitioner', 'assistant_associate') then
    return query select true, joined_profession;
    return;
  end if;

  select exists (
    select 1 from public.advocate_registrations ar
    where ar.auth_user_id = uid
  ) into has_linked_advocate_profile;

  if has_linked_advocate_profile then
    if exists (
      select 1
      from public.advocate_registrations ar
      where ar.auth_user_id = uid
        and pg_catalog.lower(coalesce(ar.status, 'pending')) not in ('rejected', 'cancelled')
    ) then
      return query select true, 'advocate'::text;
      return;
    end if;
  elsif caller_email <> '' and exists (
    select 1
    from public.advocate_registrations ar
    where ar.auth_user_id is null
      and pg_catalog.lower(ar.email) = caller_email
      and pg_catalog.lower(coalesce(ar.status, 'pending')) not in ('rejected', 'cancelled')
  ) then
    return query select true, 'advocate'::text;
    return;
  end if;

  -- Auth metadata remains a compatibility hint only; it never grants access alone.
  if app_profession in ('ca', 'cs', 'hr', 'gst_practitioner', 'assistant_associate', 'advocate') then
    return query select false, null::text;
    return;
  end if;

  return query select false, null::text;
end;
$function$;

revoke all on function public.ils_professional_member_context() from public, anon;
grant execute on function public.ils_professional_member_context() to authenticated, service_role;
