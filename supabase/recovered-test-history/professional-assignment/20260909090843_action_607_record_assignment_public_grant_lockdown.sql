REVOKE EXECUTE ON FUNCTION public.record_assignment_decision(text,uuid,text,text,text,text,text,integer,boolean,boolean,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_assignment_decision(text,uuid,text,text,text,text,text,integer,boolean,boolean,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_assignment_decision(text,uuid,text,text,text,text,text,integer,boolean,boolean,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_assignment_decision(text,uuid,text,text,text,text,text,integer,boolean,boolean,jsonb) TO service_role;