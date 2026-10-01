-- Admin deletion hardening, client management restoration support, and order customer-name data.
-- Applied to production Supabase project before committing this migration file.

create or replace function public.ils_admin_delete_data(p_entity_type text, p_entity_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
  v_order uuid;
  v_user uuid;
  v_photo text;
  v_adv_photo text;
  v_req_ids bigint[];
  v_order_ids uuid[];
  v_storage jsonb := '[]'::jsonb;
  v_payment_storage jsonb := '[]'::jsonb;
  v_doc_storage jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_count bigint := 0;
begin
  if not public.ils_is_admin() then raise exception 'Administrator access required'; end if;
  if p_entity_type not in ('advocate','professional','client','order') then raise exception 'Unsupported deletion target'; end if;
  if p_entity_id is null or btrim(p_entity_id)='' then raise exception 'Deletion target id is required'; end if;

  if p_entity_type='advocate' then
    v_id:=p_entity_id::bigint;
    select auth_user_id, coalesce(nullif(photo_storage_path,''),nullif(profile_photo_path,'')) into v_user,v_adv_photo
      from public.advocate_registrations where id=v_id for update;
    if not found then raise exception 'Advocate profile not found'; end if;
    if v_adv_photo is not null then
      v_storage:=jsonb_build_array(jsonb_build_object('bucket','advocate-photo-pending','path',v_adv_photo));
    end if;
    delete from public.advocate_assignments where advocate_id=v_id;
    delete from public.advocate_registrations where id=v_id;
    get diagnostics v_count=row_count;
    v_summary:=jsonb_build_object('profile_rows',v_count,'profile_photo_cleanup',v_adv_photo is not null);
    insert into public.ils_admin_deletion_audit(entity_type,entity_id,actor_user_id,summary)
      values(p_entity_type,p_entity_id,v_actor,v_summary);
    return jsonb_build_object('ok',true,'entity_type',p_entity_type,'entity_id',p_entity_id,
      'auth_user_id',v_user,'storage',v_storage,'summary',v_summary);
  end if;

  if p_entity_type='professional' then
    v_id:=p_entity_id::bigint;
    select auth_user_id,photo_storage_path into v_user,v_photo
      from public.professional_join_requests where id=v_id for update;
    if not found then raise exception 'Professional profile not found'; end if;
    if v_photo is not null and btrim(v_photo)<>'' then
      v_storage:=jsonb_build_array(jsonb_build_object('bucket','advocate-photo-pending','path',v_photo));
    end if;
    delete from public.professional_join_requests where id=v_id;
    get diagnostics v_count=row_count;
    v_summary:=jsonb_build_object('profile_rows',v_count);
    insert into public.ils_admin_deletion_audit(entity_type,entity_id,actor_user_id,summary)
      values(p_entity_type,p_entity_id,v_actor,v_summary);
    return jsonb_build_object('ok',true,'entity_type',p_entity_type,'entity_id',p_entity_id,
      'auth_user_id',v_user,'storage',v_storage,'summary',v_summary);
  end if;

  if p_entity_type='order' then
    v_order:=p_entity_id::uuid;
    select user_id into v_user from public.orders where id=v_order for update;
    if not found then raise exception 'Order not found'; end if;
    select coalesce(
      jsonb_agg(jsonb_build_object('bucket','payment-proofs','path',screenshot_path))
        filter (where screenshot_path is not null and btrim(screenshot_path)<>''),'[]'::jsonb)
      into v_storage from public.payment_proofs where order_id=v_order;
    delete from public.ils_action_assistance_queue where order_id=v_order;
    delete from public.entitlements where order_id=v_order;
    delete from public.orders where id=v_order;
    v_summary:=jsonb_build_object('order_deleted',true);
    insert into public.ils_admin_deletion_audit(entity_type,entity_id,actor_user_id,summary)
      values(p_entity_type,p_entity_id,v_actor,v_summary);
    return jsonb_build_object('ok',true,'entity_type',p_entity_type,'entity_id',p_entity_id,
      'auth_user_id',null,'storage',coalesce(v_storage,'[]'::jsonb),'summary',v_summary);
  end if;

  v_id:=p_entity_id::bigint;
  select id into v_id from public.client_requirements where id=v_id for update;
  if not found then raise exception 'Client matter not found'; end if;
  select user_id into v_user from public.customer_profiles where client_requirement_id=v_id limit 1;

  select coalesce(array_agg(sr.id),'{}'::bigint[]) into v_req_ids
    from public.service_requests sr
    where sr.client_requirement_id=v_id or (v_user is not null and sr.user_id=v_user);

  select coalesce(array_agg(o.id),'{}'::uuid[]) into v_order_ids
    from public.orders o
    where (v_user is not null and o.user_id=v_user) or o.service_request_id=any(v_req_ids);

  if coalesce(array_length(v_order_ids,1),0)>0 then
    select coalesce(
      jsonb_agg(jsonb_build_object('bucket','payment-proofs','path',screenshot_path))
        filter (where screenshot_path is not null and btrim(screenshot_path)<>''),'[]'::jsonb)
      into v_payment_storage from public.payment_proofs where order_id=any(v_order_ids);
    delete from public.ils_action_assistance_queue where order_id=any(v_order_ids);
    delete from public.entitlements where order_id=any(v_order_ids);
    delete from public.orders where id=any(v_order_ids);
  end if;

  if coalesce(array_length(v_req_ids,1),0)>0 then
    delete from public.ils_action_assistance_queue where service_request_id=any(v_req_ids);
    delete from public.service_requests where id=any(v_req_ids);
  end if;

  if v_user is not null then
    delete from public.entitlements where user_id=v_user;
    delete from public.ils_professional_tool_usage_events where user_id=v_user;
    delete from public.ils_professional_tool_usage where user_id=v_user;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('bucket','client-matter-documents','path',cmd.storage_path))
      filter (where cmd.storage_path is not null and btrim(cmd.storage_path)<>''),'[]'::jsonb)
    into v_doc_storage
    from public.client_matter_documents cmd where cmd.lead_id=v_id;

  v_storage:=coalesce(v_payment_storage,'[]'::jsonb) || coalesce(v_doc_storage,'[]'::jsonb);

  delete from public.customer_profiles where client_requirement_id=v_id;
  delete from public.client_requirements where id=v_id;

  v_summary:=jsonb_build_object('client_matter_deleted',true,
    'service_requests_deleted',coalesce(array_length(v_req_ids,1),0),
    'orders_deleted',coalesce(array_length(v_order_ids,1),0));
  insert into public.ils_admin_deletion_audit(entity_type,entity_id,actor_user_id,summary)
    values(p_entity_type,p_entity_id,v_actor,v_summary);
  return jsonb_build_object('ok',true,'entity_type',p_entity_type,'entity_id',p_entity_id,
    'auth_user_id',v_user,'storage',coalesce(v_storage,'[]'::jsonb),'summary',v_summary);
end;
$function$;

create or replace function public.ils_admin_revenue_dashboard(p_limit integer default 100)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,100),250));
begin
  if v_user is null or not public.ils_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'stats', jsonb_build_object(
      'orders_total', (select count(*) from public.orders),
      'orders_pending', (select count(*) from public.orders where status='pending'),
      'orders_paid', (select count(*) from public.orders where status='paid'),
      'orders_failed', (select count(*) from public.orders where status='failed'),
      'revenue_paid', coalesce((select sum(total) from public.orders where status='paid'),0),
      'service_requests_pending', (select count(*) from public.service_requests where status='pending')
    ),
    'orders', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select o.id,o.order_number,o.user_id,o.total,o.currency,o.status,o.created_at,
             s.slug as service_slug,s.name as service_name,
             sr.id as service_request_id,sr.status as service_status,sr.details,
             coalesce(nullif(trim(sr.details->>'name'),''),nullif(trim(cp.full_name),'')) as customer_name,
             coalesce(nullif(trim(sr.details->>'mobile'),''),nullif(trim(cp.mobile),'')) as customer_mobile,
             tr.slug as source_tool_slug,tr.name as source_tool_name
      from public.orders o
      left join public.service_requests sr on sr.id=o.service_request_id
      left join public.customer_profiles cp on cp.user_id=o.user_id
      left join public.services s on s.id=(select oi.service_id from public.order_items oi where oi.order_id=o.id order by oi.id limit 1)
      left join public.tool_runs tur on tur.id=sr.tool_run_id
      left join public.tool_catalog tr on tr.id=tur.tool_id
      order by o.created_at desc limit v_limit
    ) x), '[]'::jsonb)
  );
end;
$function$;

revoke execute on function public.ils_admin_delete_data(text,text) from public, anon, authenticated;
grant execute on function public.ils_admin_delete_data(text,text) to service_role;

revoke execute on function public.ils_admin_revenue_dashboard(integer) from public, anon;
grant execute on function public.ils_admin_revenue_dashboard(integer) to authenticated, service_role;
