-- ILS professional public-visibility guard
-- Server-side invariant: only approved CA/CS may be public.

create or replace function public.ils_guard_professional_public_profile()
returns trigger
language plpgsql
as $$
begin
  if new.professional_type not in ('ca','cs') then
    new.public_profile := false;
  elsif lower(coalesce(new.status,'pending')) <> 'approved'
     or lower(coalesce(new.verification_status,'pending')) <> 'approved' then
    new.public_profile := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ils_guard_professional_public_profile
  on public.professional_join_requests;

create trigger trg_ils_guard_professional_public_profile
before insert or update of professional_type,status,verification_status,public_profile
on public.professional_join_requests
for each row
execute function public.ils_guard_professional_public_profile();

update public.professional_join_requests
set public_profile=false
where professional_type not in ('ca','cs')
   or lower(coalesce(status,'pending')) <> 'approved'
   or lower(coalesce(verification_status,'pending')) <> 'approved';
