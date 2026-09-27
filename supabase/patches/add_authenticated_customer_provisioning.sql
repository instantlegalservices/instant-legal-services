-- Applied to Supabase production on 2026-09-27 as the authenticated customer provisioning release fix.
-- Creates the customer subject/profile layer and an authenticated-only provisioning RPC.
-- See database migration history for the applied change: add_authenticated_customer_provisioning.

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  client_requirement_id bigint null references public.client_requirements(id) on delete set null,
  full_name text not null,
  mobile text,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

create policy customer_profiles_own_select on public.customer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy customer_profiles_own_insert on public.customer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy customer_profiles_own_update on public.customer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists customer_profiles_client_requirement_id_idx on public.customer_profiles(client_requirement_id);

create or replace function public.provision_customer_profile(p_full_name text,p_mobile text default null,p_client_requirement_id bigint default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $function$
declare v_user uuid := (select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_full_name,'')),'') is null then raise exception 'FULL_NAME_REQUIRED'; end if;
  if p_client_requirement_id is not null and not exists (select 1 from public.client_requirements where id=p_client_requirement_id) then raise exception 'CLIENT_REQUIREMENT_NOT_FOUND'; end if;
  insert into public.customer_profiles(user_id,client_requirement_id,full_name,mobile)
  values(v_user,p_client_requirement_id,trim(p_full_name),nullif(trim(coalesce(p_mobile,'')),''))
  on conflict(user_id) do update set client_requirement_id=excluded.client_requirement_id,full_name=excluded.full_name,mobile=excluded.mobile,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'customer_profile_id',v_id,'user_id',v_user);
end;$function$;

revoke all on function public.provision_customer_profile(text,text,bigint) from public;
grant execute on function public.provision_customer_profile(text,text,bigint) to authenticated;
