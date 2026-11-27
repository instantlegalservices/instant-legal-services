-- Allow an authenticated customer to create a CRM enquiry and receive only its new ID.
-- Direct CRM SELECT remains Admin-only; anonymous public intake keeps its existing insert path.

create or replace function public.ils_submit_customer_requirement(
  p_client_name text,
  p_mobile text,
  p_state text default null,
  p_district_city text default null,
  p_legal_matter text default null,
  p_brief_requirement text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_name text := nullif(trim(coalesce(p_client_name,'')),'');
  v_mobile text := trim(coalesce(p_mobile,''));
  v_brief text := nullif(trim(coalesce(p_brief_requirement,'')),'');
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_name is null or length(v_name) > 100 then
    raise exception 'CLIENT_NAME_INVALID';
  end if;
  if v_mobile !~ '^[0-9]{10}$' then
    raise exception 'CLIENT_MOBILE_INVALID';
  end if;
  if v_brief is null or length(v_brief) > 3000 then
    raise exception 'CLIENT_REQUIREMENT_INVALID';
  end if;

  insert into public.client_requirements
    (client_name, mobile, state, district_city, legal_matter, brief_requirement, "Souce", payment_status)
  values
    (v_name, v_mobile,
     nullif(trim(coalesce(p_state,'')),''),
     nullif(trim(coalesce(p_district_city,'')),''),
     nullif(trim(coalesce(p_legal_matter,'')),''),
     v_brief,
     'Website — Authenticated Client',
     'Pending')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.ils_submit_customer_requirement(text,text,text,text,text,text) from public, anon;
grant execute on function public.ils_submit_customer_requirement(text,text,text,text,text,text) to authenticated;

comment on function public.ils_submit_customer_requirement(text,text,text,text,text,text)
is 'Creates one validated CRM enquiry for an authenticated customer and returns only the new requirement ID; does not grant CRM row read access.';
