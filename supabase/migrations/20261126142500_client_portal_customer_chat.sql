-- Authenticated customer-only matter chat.
create or replace function public.ils_customer_portal_chat(p_client_id bigint default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_ids bigint[];
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.customer_profiles where user_id=v_user and status='active') then raise exception 'ACTIVE_CUSTOMER_PROFILE_REQUIRED' using errcode='42501'; end if;
 select array_agg(distinct rid) into v_ids from (select client_requirement_id rid from public.customer_profiles where user_id=v_user and status='active' and client_requirement_id is not null union select client_requirement_id from public.service_requests where user_id=v_user and client_requirement_id is not null) x;
 if p_client_id is not null and not (p_client_id=any(coalesce(v_ids,'{}'::bigint[]))) then raise exception 'MATTER_ACCESS_DENIED' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_role',m.sender_role,'sender_name',m.sender_name,'message',m.message,'created_at',m.created_at) order by m.created_at) from public.client_chat_messages m where m.lead_id=any(coalesce(v_ids,'{}'::bigint[])) and (p_client_id is null or m.lead_id=p_client_id)),'[]'::jsonb));
end; $$;
revoke all on function public.ils_customer_portal_chat(bigint) from public,anon;
grant execute on function public.ils_customer_portal_chat(bigint) to authenticated;
create or replace function public.ils_customer_portal_send_message(p_client_id bigint,p_message text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_name text; v_owned boolean;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if length(trim(coalesce(p_message,'')))=0 or length(trim(p_message))>4000 then return jsonb_build_object('ok',false,'message','Message must contain 1–4000 characters'); end if;
 select full_name into v_name from public.customer_profiles where user_id=v_user and status='active' limit 1;
 if v_name is null then raise exception 'ACTIVE_CUSTOMER_PROFILE_REQUIRED' using errcode='42501'; end if;
 select exists(select 1 from public.customer_profiles where user_id=v_user and status='active' and client_requirement_id=p_client_id union all select 1 from public.service_requests where user_id=v_user and client_requirement_id=p_client_id) into v_owned;
 if not v_owned then raise exception 'MATTER_ACCESS_DENIED' using errcode='42501'; end if;
 insert into public.client_chat_messages(lead_id,sender_role,sender_name,message,read_by_client,read_by_advocate,read_by_admin) values(p_client_id,'client',v_name,trim(p_message),true,false,false);
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.ils_customer_portal_send_message(bigint,text) from public,anon;
grant execute on function public.ils_customer_portal_send_message(bigint,text) to authenticated;