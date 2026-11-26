-- Ensure direct client signups become visible as client accounts before email confirmation.
-- Only explicitly tagged customer signups are provisioned; professional/admin auth flows are untouched.

create or replace function public.ils_provision_customer_on_auth_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_name text;
  v_mobile text;
begin
  if coalesce(new.raw_user_meta_data->>'account_type','') <> 'customer' then
    return new;
  end if;

  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name','')), '');
  if v_name is null then
    v_name := coalesce(nullif(split_part(coalesce(new.email,''),'@',1),''),'ILS Customer');
  end if;
  v_mobile := nullif(btrim(coalesce(new.raw_user_meta_data->>'mobile','')), '');

  insert into public.customer_profiles(user_id,full_name,mobile,status)
  values(new.id,v_name,v_mobile,'active')
  on conflict(user_id) do update
    set full_name=excluded.full_name,
        mobile=coalesce(excluded.mobile,public.customer_profiles.mobile),
        updated_at=now();

  return new;
end;
$$;

drop trigger if exists ils_customer_profile_after_auth_signup on auth.users;
create trigger ils_customer_profile_after_auth_signup
after insert on auth.users
for each row execute function public.ils_provision_customer_on_auth_signup();

create or replace function public.ils_admin_list_customer_accounts()
returns table(
  profile_id uuid,
  user_id uuid,
  email text,
  full_name text,
  mobile text,
  account_status text,
  registered_at timestamptz,
  client_requirement_id bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not coalesce(public.ils_is_admin(),false) then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;

  return query
  select cp.id,cp.user_id,u.email,cp.full_name,cp.mobile,cp.status,cp.created_at,cp.client_requirement_id
  from public.customer_profiles cp
  join auth.users u on u.id=cp.user_id
  order by cp.created_at desc
  limit 500;
end;
$$;

revoke all on function public.ils_admin_list_customer_accounts() from public, anon;
grant execute on function public.ils_admin_list_customer_accounts() to authenticated;
