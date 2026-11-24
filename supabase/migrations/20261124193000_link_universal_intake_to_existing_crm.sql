-- Link paid universal service-form submissions to the existing Admin CRM.
-- Uses the existing service_requests and client_requirements tables only.
-- On Production, the relationship column already exists; on TEST this safely adds it.
alter table public.service_requests
  add column if not exists client_requirement_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and conname = 'service_requests_client_requirement_id_fkey'
  ) then
    alter table public.service_requests
      add constraint service_requests_client_requirement_id_fkey
      foreign key (client_requirement_id)
      references public.client_requirements(id)
      on delete set null;
  end if;
end
$$;

create or replace function public.ils_link_universal_intake_to_crm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text := coalesce(new.details->>'intake_source','');
  v_name text := nullif(trim(coalesce(new.details->>'name','')),'');
  v_mobile text := nullif(trim(coalesce(new.details->>'mobile','')),'');
  v_matter text := nullif(trim(coalesce(new.details->>'matter','')),'');
  v_service text := nullif(trim(coalesce(new.details->>'intake_service','')),'');
  v_option text := nullif(trim(coalesce(new.details->>'service_option','')),'');
  v_business text := nullif(trim(coalesce(new.details->>'business_type','')),'');
  v_brief text := nullif(trim(coalesce(new.details->>'brief','')),'');
  v_lead_id bigint;
begin
  if v_source <> 'ils-universal-service-form' then
    return new;
  end if;

  if v_name is null or v_mobile is null or length(v_mobile) <> 10 then
    raise exception 'UNIVERSAL_INTAKE_CONTACT_REQUIRED';
  end if;

  insert into public.client_requirements
    (client_name, mobile, state, district_city, legal_matter, brief_requirement, "Souce", payment_status)
  values
    (v_name, v_mobile,
     nullif(trim(coalesce(new.details->>'state','')),''),
     nullif(trim(coalesce(new.details->>'city','')),''),
     coalesce(v_matter,'Service Assistance') ||
       case when v_service is not null then ' — ' || replace(v_service,'-',' ') else '' end,
     left(concat_ws(' | ',
       case when v_business is not null then 'Business type: ' || v_business end,
       case when v_option is not null then 'Selected service: ' || v_option end,
       v_brief
     ), 3000),
     'Website — Universal Service Form',
     'Pending')
  returning id into v_lead_id;

  new.client_requirement_id := v_lead_id;
  return new;
end;
$$;

drop trigger if exists trg_ils_link_universal_intake_to_crm on public.service_requests;
create trigger trg_ils_link_universal_intake_to_crm
before insert on public.service_requests
for each row
execute function public.ils_link_universal_intake_to_crm();

-- This helper is trigger-only; do not expose it as a callable PostgREST RPC.
revoke all on function public.ils_link_universal_intake_to_crm() from public, anon, authenticated;

comment on function public.ils_link_universal_intake_to_crm()
is 'Creates one Admin CRM client_requirements record for each paid universal service form request and links it to the existing service_request.';
