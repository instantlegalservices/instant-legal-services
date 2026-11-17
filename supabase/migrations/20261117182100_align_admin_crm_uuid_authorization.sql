-- Keep Admin CRM database authorization aligned with the UUID allow-list
-- used by the Admin UI and the client_requirements RLS policy.
do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_old text := E'if v_email <> ''fahat29@gmail.com'' then\n    raise exception ''Administrator access required.'';\n  end if;';
  v_new text := E'if not public.ils_is_admin() then\n    raise exception ''Administrator access required.'';\n  end if;';
  v_matches integer;
begin
  foreach v_function in array array[
    'public.ils_admin_save_lead(bigint,text,text,text,bigint,boolean,date,text)'::regprocedure,
    'public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_function) into v_definition;
    v_definition := replace(v_definition, E'\\r\\n', E'\\n');
    v_matches := length(v_definition) - length(replace(v_definition, v_old, ''));
    if v_matches = 0 or v_matches / length(v_old) <> 1 then
      raise exception 'Expected exactly one legacy email guard in %; refusing migration', v_function;
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end loop;
end
$migration$;
