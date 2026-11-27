-- Link authenticated client-catalogue orders to the CRM lead created by the intake form.
-- The browser saves the CRM lead first and passes its ID in service-request details.
-- Keep the existing universal-intake trigger behavior unchanged and avoid duplicate CRM rows.

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
  if v_source = 'ils-client-portal-service-catalogue' then
    begin
      v_lead_id := nullif(trim(coalesce(new.details->>'client_requirement_id','')),'')::bigint;
    exception when invalid_text_representation then
      raise exception 'CLIENT_REQUIREMENT_LINK_INVALID';
    end;

    if v_lead_id is null then
      raise exception 'CLIENT_REQUIREMENT_LINK_REQUIRED';
    end if;

    if v_name is null or v_mobile is null then
      raise exception 'CLIENT_REQUIREMENT_IDENTITY_REQUIRED';
    end if;

    perform 1
    from public.client_requirements cr
    where cr.id = v_lead_id
      and cr.client_name = v_name
      and cr.mobile = v_mobile
      and coalesce(cr.state,'') = coalesce(nullif(trim(coalesce(new.details->>'state','')),'') ,'')
      and coalesce(cr.district_city,'') = coalesce(nullif(trim(coalesce(new.details->>'city','')),''),'')
      and coalesce(cr.legal_matter,'') = coalesce(v_matter,'');
    if not found then
      raise exception 'CLIENT_REQUIREMENT_NOT_FOUND_OR_IDENTITY_MISMATCH';
    end if;

    new.client_requirement_id := v_lead_id;
    return new;
  end if;

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

revoke all on function public.ils_link_universal_intake_to_crm() from public, anon, authenticated;

comment on function public.ils_link_universal_intake_to_crm()
is 'Links authenticated client-catalogue service requests to the CRM lead saved by the intake form, and creates one CRM lead for universal service form requests.';
