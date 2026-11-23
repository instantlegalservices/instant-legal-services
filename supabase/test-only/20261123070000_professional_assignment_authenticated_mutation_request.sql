-- TEST-only authenticated entrypoint for the internal Professional Assignment mutation RPC.
-- Preserve the original caller JWT claims while using a SECURITY DEFINER boundary
-- to invoke the service_role-only internal mutation function.
CREATE OR REPLACE FUNCTION public.ils_professional_assignment_mutation_request(
  p_assignment_link_id uuid,
  p_operation text,
  p_to_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- EXECUTE is granted only to authenticated; the signed JWT subject is
  -- independently required here and again by the internal ownership gate.
  IF auth.uid() IS NULL
     OR p_assignment_link_id IS NULL
     OR p_operation IS NULL
     OR p_operation NOT IN ('ACTIVATE','PAUSE','REVOKE','COMPLETE')
     OR p_to_status IS NULL
     OR p_to_status NOT IN ('ACTIVE','PAUSED','REVOKED','COMPLETED') THEN
    RETURN false;
  END IF;

  -- The internal gate independently checks ownership and lifecycle state.
  IF NOT public.ils_professional_assignment_mutation_gate(
       p_assignment_link_id,p_operation,p_to_status) THEN
    RAISE EXCEPTION 'MUTATION_GATE_DIAGNOSTIC uid=% role=% assignment_owner=% status=%',
      auth.uid(),auth.role(),
      (SELECT l.professional_user_id FROM public.ils_professional_work_assignment_links l
       WHERE l.id=p_assignment_link_id),
      (SELECT l.link_status FROM public.ils_professional_work_assignment_links l
       WHERE l.id=p_assignment_link_id);
  END IF;
  RETURN public.ils_professional_assignment_mutation_commit(
    p_assignment_link_id,p_operation,p_to_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_professional_assignment_mutation_request(uuid,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ils_professional_assignment_mutation_request(uuid,text,text)
  TO authenticated;
