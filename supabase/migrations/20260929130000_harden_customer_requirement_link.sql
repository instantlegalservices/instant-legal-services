-- Release-gate security hardening: an authenticated customer must prove possession of the
-- mobile number already attached to an existing client requirement before linking it.
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
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_full_name,'')),'') is null then
    raise exception 'FULL_NAME_REQUIRED';
  end if;

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
  end if;

  insert into public.customer_profiles(
    user_id,
    client_requirement_id,
    full_name,
    mobile
  )
  values(
    v_user,
    p_client_requirement_id,
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

revoke execute on function public.provision_customer_profile(text,text,bigint) from anon, public;
grant execute on function public.provision_customer_profile(text,text,bigint) to authenticated;
