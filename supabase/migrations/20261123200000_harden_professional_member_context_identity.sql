-- Bind professional-member lookup to the authenticated Supabase user first.
-- Email compatibility is permitted only for legacy rows with no auth_user_id.
-- Preserve existing member eligibility: Pending applications remain eligible;
-- only Rejected and Cancelled rows are excluded, as in the deployed contract.

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
begin
  if uid is null then
    return query select false, null::text;
    return;
  end if;

  select pg_catalog.lower(pg_catalog.btrim(p.professional_type))
    into joined_profession
  from public.professional_join_requests p
  where (
      p.auth_user_id = uid
      or (
        p.auth_user_id is null
        and caller_email <> ''
        and pg_catalog.lower(p.email) = caller_email
      )
    )
    and pg_catalog.lower(coalesce(p.status, 'pending')) not in ('rejected', 'cancelled')
  order by p.created_at desc
  limit 1;

  if joined_profession in ('ca', 'cs', 'hr', 'gst_practitioner', 'assistant_associate') then
    return query select true, joined_profession;
    return;
  end if;

  if exists (
    select 1
    from public.advocate_registrations ar
    where (
        ar.auth_user_id = uid
        or (
          ar.auth_user_id is null
          and caller_email <> ''
          and pg_catalog.lower(ar.email) = caller_email
        )
      )
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
