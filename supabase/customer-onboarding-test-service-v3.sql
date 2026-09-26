-- CUSTOMER ONBOARDING E2E V3
-- TEST-only service boundary hardening.
-- Adds one non-synthetic TEST service catalog entry and removes the
-- synthetic-service fallback from the Customer onboarding RPC.
-- No schema changes and no RLS changes.

insert into public.services (slug, name, status)
values ('legal_assistance', 'Legal Assistance (TEST)', 'active')
on conflict (slug) do nothing;

create or replace function public.ils_customer_onboarding_v1(
  p_complaint_token text,
  p_complaint_summary text,
  p_service_code text,
  p_language_code text default 'hi-IN',
  p_urgency text default 'NORMAL',
  p_required_documents jsonb default '[]'::jsonb,
  p_official_route_url text default null,
  p_assistance_tier text default 'SELF_FREE'
)
returns table(customer_id uuid, passport_id uuid, status text, created boolean, environment text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_contract public.ils_test_auth_onboarding_contract%rowtype;
  v_passport_id uuid;
  v_status text;
  v_created boolean;
  v_service_id uuid;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into v_contract
  from public.ils_test_auth_onboarding_contract
  where contract_code = 'TEST_AUTH_NORMAL_CLIENT_ONBOARDING_V1'
  limit 1;

  if v_contract.id is null
     or v_contract.status <> 'ACTIVE'
     or v_contract.environment <> 'TEST'
     or v_contract.normal_client_signup_allowed is not true
     or v_contract.production_access_allowed is not false
     or v_contract.real_customer_data_allowed is not false
     or v_contract.jwt_manufacture_allowed is not false
  then raise exception 'TEST_CUSTOMER_ONBOARDING_BOUNDARY_NOT_AVAILABLE'; end if;

  if nullif(btrim(p_complaint_token), '') is null then raise exception 'COMPLAINT_TOKEN_REQUIRED'; end if;
  if nullif(btrim(p_complaint_summary), '') is null then raise exception 'COMPLAINT_SUMMARY_REQUIRED'; end if;
  if nullif(btrim(p_service_code), '') is null then raise exception 'SERVICE_CODE_REQUIRED'; end if;
  if p_required_documents is null or jsonb_typeof(p_required_documents) <> 'array' then
    raise exception 'REQUIRED_DOCUMENTS_MUST_BE_ARRAY';
  end if;

  select s.id into v_service_id
  from public.services s
  where lower(btrim(s.slug)) = lower(btrim(p_service_code))
    and lower(btrim(s.status)) = 'active'
  limit 1;

  if v_service_id is null then raise exception 'SERVICE_NOT_AVAILABLE'; end if;

  select cp.id, cp.status into v_passport_id, v_status
  from public.ils_complaint_passports cp
  where cp.complaint_token = btrim(p_complaint_token)
    and cp.customer_id = v_user_id
  limit 1;

  if v_passport_id is not null then
    if not exists (
      select 1 from public.service_requests sr
      where sr.user_id = v_user_id and sr.service_id = v_service_id
    ) then
      insert into public.service_requests(user_id, service_id, status)
      values (v_user_id, v_service_id, 'pending');
    end if;
    customer_id := v_user_id;
    passport_id := v_passport_id;
    status := v_status;
    created := false;
    environment := 'TEST';
    return next;
    return;
  end if;

  select cp.passport_id, cp.status, cp.created
    into v_passport_id, v_status, v_created
  from public.ils_create_customer_passport_v1(
    btrim(p_complaint_token),
    btrim(p_complaint_summary),
    btrim(p_service_code),
    coalesce(nullif(btrim(p_language_code), ''), 'hi-IN'),
    null,
    null,
    coalesce(nullif(btrim(p_urgency), ''), 'NORMAL'),
    p_required_documents,
    p_official_route_url,
    null,
    coalesce(nullif(btrim(p_assistance_tier), ''), 'SELF_FREE')
  ) cp;

  insert into public.service_requests(user_id, service_id, status)
  values (v_user_id, v_service_id, 'pending');

  customer_id := v_user_id;
  passport_id := v_passport_id;
  status := v_status;
  created := coalesce(v_created, false);
  environment := 'TEST';
  return next;
end;
$function$;

revoke execute on function public.ils_customer_onboarding_v1(text,text,text,text,text,jsonb,text,text) from public;
revoke execute on function public.ils_customer_onboarding_v1(text,text,text,text,text,jsonb,text,text) from anon;
grant execute on function public.ils_customer_onboarding_v1(text,text,text,text,text,jsonb,text,text) to authenticated;
