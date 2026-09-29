-- Release-gate security hardening: an authenticated customer must prove possession of the
-- mobile number already attached to an existing client requirement before linking it.
-- A requirement can be linked to only one customer profile, and an existing link cannot
-- be silently replaced or cleared by a later RPC call.
-- This file is intentionally staged on the release-gate branch only; do not apply to
-- production until TEST E2E verification passes.

create or replace function public.provision_customer_profile(
  p_full_name text,
  p_mobile text default null,
  p_client_requirement_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_mobile text := nullif(trim(coalesce(p_mobile,'')),'');
  v_existing_requirement_id bigint;
  v_target_requirement_id bigint;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_full_name,'')),'') is null then
    raise exception 'FULL_NAME_REQUIRED';
  end if;

  select client_requirement_id
    into v_existing_requirement_id
  from public.customer_profiles
  where user_id = v_user;

  v_target_requirement_id := v_existing_requirement_id;

  if p_client_requirement_id is not null then
    if v_mobile is null then
      raise exception 'MOBILE_REQUIRED_FOR_EXISTING_REQUIREMENT';
    end if;

    if v_mobile !~ '^[0-9]{10}$' then
      raise exception 'INVALID_MOBILE_FOR_EXISTING_REQUIREMENT';
    end if;

    if not exists (
      select 1
      from public.client_requirements
      where id = p_client_requirement_id
        and regexp_replace(coalesce(mobile,''),'[^0-9]','','g') = v_mobile
    ) then
      raise exception 'CLIENT_REQUIREMENT_NOT_FOUND_OR_MOBILE_MISMATCH';
    end if;

    if v_existing_requirement_id is not null
       and v_existing_requirement_id <> p_client_requirement_id then
      raise exception 'CUSTOMER_REQUIREMENT_ALREADY_BOUND';
    end if;

    if exists (
      select 1
      from public.customer_profiles
      where client_requirement_id = p_client_requirement_id
        and user_id <> v_user
    ) then
      raise exception 'CLIENT_REQUIREMENT_ALREADY_LINKED';
    end if;

    v_target_requirement_id := p_client_requirement_id;
  end if;

  insert into public.customer_profiles(
    user_id,
    client_requirement_id,
    full_name,
    mobile
  )
  values(
    v_user,
    v_target_requirement_id,
    trim(p_full_name),
    v_mobile
  )
  on conflict(user_id) do update
    set client_requirement_id = excluded.client_requirement_id,
        full_name = excluded.full_name,
        mobile = excluded.mobile,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'customer_profile_id', v_id,
    'user_id', v_user
  );
end;
$function$;

-- Defense in depth: enforce one customer profile per client requirement at the
-- database level. NULL remains allowed for profiles not yet linked to a requirement.
drop index if exists public.customer_profiles_client_requirement_id_idx;
create unique index customer_profiles_client_requirement_id_idx
  on public.customer_profiles using btree (client_requirement_id);

revoke execute on function public.provision_customer_profile(text,text,bigint) from anon, public;
grant execute on function public.provision_customer_profile(text,text,bigint) to authenticated;
