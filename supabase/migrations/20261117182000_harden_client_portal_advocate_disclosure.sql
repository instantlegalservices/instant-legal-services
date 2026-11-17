-- Defense in depth for client portal advocate disclosure.
-- A released lead contact is not sufficient: the specific active assignment must
-- also permit client contact visibility, and the advocate must be approved.
do $migration$
declare
  v_definition text;
  v_old_primary text := E'where aa.lead_id = c.id\n              and aa.status in (''Assigned'',''Active'')\n\n            order by aa.assigned_at asc';
  v_new_primary text := E'where aa.lead_id = c.id\n              and aa.status in (''Assigned'',''Active'')\n              and coalesce(ar.verification_status, ar.status, ''Pending'') = ''Approved''\n\n            order by aa.assigned_at asc';
  v_mobile_pattern text := E'case\\s+when coalesce\\(\\s*c\\.release_advocate_contact,\\s*false\\s*\\)\\s*then ar\\.mobile\\s*else null\\s*end';
  v_mobile_count integer;
begin
  select pg_get_functiondef('public.get_client_portal(text,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');

  select count(*) into v_mobile_count
  from regexp_matches(v_definition, v_mobile_pattern, 'g');

  if v_mobile_count <> 2 then
    raise exception 'Expected two client portal advocate mobile guards; found %', v_mobile_count;
  end if;

  v_definition := regexp_replace(
    v_definition,
    v_mobile_pattern,
    'case when coalesce(c.release_advocate_contact,false) and coalesce(aa.client_can_see_contact,false) then ar.mobile else null end',
    'g'
  );

  if position(v_old_primary in v_definition) = 0 then
    raise exception 'Primary advocate query did not match the reviewed definition; refusing partial migration';
  end if;

  v_definition := replace(v_definition, v_old_primary, v_new_primary);
  execute v_definition;
end
$migration$;
