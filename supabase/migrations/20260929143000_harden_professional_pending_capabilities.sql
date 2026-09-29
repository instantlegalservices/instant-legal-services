-- Release-gate hardening: pending professional registrations may sign in and view
-- review status, but must not receive member-only tool capability until approved and verified.
-- This migration is intentionally staged on release-gate-20260929 only.

create or replace function public.ils_professional_member_context()
returns table(is_member boolean, profession text)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  caller_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
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
    and lower(coalesce(p.status,'pending')) = 'approved'
    and lower(coalesce(p.verification_status,'pending')) = 'approved'
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
      and lower(coalesce(ar.status,'pending')) = 'approved'
      and lower(coalesce(ar.verification_status,'pending')) = 'approved'
  ) then
    return query select true, 'advocate'::text;
    return;
  end if;

  return query select false, null::text;
end;
$function$;

revoke all on function public.ils_professional_member_context() from public;
grant execute on function public.ils_professional_member_context() to authenticated;
