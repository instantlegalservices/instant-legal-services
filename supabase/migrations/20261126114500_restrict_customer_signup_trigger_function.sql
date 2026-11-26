-- The signup provisioning function is invoked by the auth.users trigger only.
-- Prevent direct RPC invocation by API roles; trigger execution remains enabled.
revoke all on function public.ils_provision_customer_on_auth_signup()
  from public, anon, authenticated, service_role;

-- Explicitly retain the existing trigger; this migration changes function ACL only.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'ils_customer_profile_after_auth_signup'
      and n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    raise exception 'EXPECTED_CUSTOMER_SIGNUP_TRIGGER_NOT_ACTIVE';
  end if;
end;
$$;
