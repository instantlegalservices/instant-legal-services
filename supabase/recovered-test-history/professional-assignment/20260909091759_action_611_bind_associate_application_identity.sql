CREATE OR REPLACE FUNCTION public.submit_associate_application(p_full_name text,p_mobile text,p_email text,p_associate_type text,p_professional_type text,p_professional_qualification text,p_professional_registration_no text,p_qualification_level text,p_additional_skills text,p_city text,p_state text,p_consent_accuracy boolean,p_consent_data_use boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_id uuid; v_lane text; v_uid uuid;
begin
 v_uid:=auth.uid();
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'name required'; end if;
 if length(regexp_replace(coalesce(p_mobile,''),'[^0-9]','','g'))<10 then raise exception 'valid mobile required'; end if;
 if p_associate_type not in ('PROFESSIONAL','ACTION_ASSISTANT') then raise exception 'invalid associate type'; end if;
 if not coalesce(p_consent_accuracy,false) or not coalesce(p_consent_data_use,false) then raise exception 'consent required'; end if;
 v_lane:=case when p_associate_type='PROFESSIONAL' then 'FEATURED_PROFESSIONAL' else 'ASSISTANT' end;
 insert into public.ils_associate_applications(user_id,full_name,mobile,email,associate_type,professional_type,professional_qualification,professional_registration_no,qualification_level,additional_skills,city,state,profile_lane,consent_accuracy,consent_data_use)
 values(v_uid,trim(p_full_name),trim(p_mobile),nullif(trim(coalesce(p_email,'')),''),p_associate_type,nullif(trim(coalesce(p_professional_type,'')),''),nullif(trim(coalesce(p_professional_qualification,'')),''),nullif(trim(coalesce(p_professional_registration_no,'')),''),nullif(trim(coalesce(p_qualification_level,'')),''),nullif(trim(coalesce(p_additional_skills,'')),''),nullif(trim(coalesce(p_city,'')),''),nullif(trim(coalesce(p_state,'')),''),v_lane,p_consent_accuracy,p_consent_data_use)
 returning id into v_id;
 return v_id;
end;$function$;
REVOKE EXECUTE ON FUNCTION public.submit_associate_application(text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_associate_application(text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) TO authenticated;