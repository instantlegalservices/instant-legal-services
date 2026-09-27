create or replace function public.ils_run_critical_path_evidence_binding_integrity_audit()
returns table(
 audit_id uuid,total_evidence integer,bound_evidence integer,orphan_registry_rows integer,
 duplicate_evidence_bindings integer,cross_path_conflicts integer,orphan_evidence integer,decision text
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
 v_id uuid; v_total integer; v_bound integer; v_orphan_registry integer;
 v_dup integer; v_cross integer; v_orphan_evidence integer; v_decision text;
begin
 if current_user <> 'postgres' and current_setting('role',true) <> 'service_role'
 then raise exception 'service_role_only'; end if;

 select count(*) into v_total from public.ils_e2e_evidence;
 select count(distinct evidence_id) into v_bound
 from public.ils_critical_path_evidence_registry where binding_status='BOUND';
 select count(*) into v_orphan_registry
 from public.ils_critical_path_evidence_registry r
 left join public.ils_e2e_evidence e on e.id=r.evidence_id
 where e.id is null;
 select count(*) into v_dup
 from (
   select evidence_id
   from public.ils_critical_path_evidence_registry
   where binding_status='BOUND'
   group by evidence_id having count(*)>1
 ) x;
 select count(*) into v_cross
 from (
   select e.id
   from public.ils_e2e_evidence e
   join public.ils_critical_path_evidence_registry r on r.evidence_id=e.id
   where r.binding_status='BOUND'
     and e.critical_path_code is not null
     and e.critical_path_code<>r.critical_path_code
 ) x;
 select count(*) into v_orphan_evidence
 from public.ils_e2e_evidence e
 left join public.ils_critical_path_evidence_registry r
   on r.evidence_id=e.id and r.binding_status='BOUND'
 where r.evidence_id is null;

 v_decision:=case
   when v_orphan_registry>0 or v_dup>0 or v_cross>0 then 'FAIL'
   when v_orphan_evidence>0 then 'HOLD'
   else 'PASS'
 end;

 insert into public.ils_critical_path_evidence_binding_integrity_audit(
   audit_code,total_evidence,bound_evidence,orphan_registry_rows,
   duplicate_evidence_bindings,cross_path_conflicts,orphan_evidence,decision
 )
 values('662',v_total,v_bound,v_orphan_registry,v_dup,v_cross,v_orphan_evidence,v_decision)
 on conflict (audit_code) do update set
   total_evidence=excluded.total_evidence,
   bound_evidence=excluded.bound_evidence,
   orphan_registry_rows=excluded.orphan_registry_rows,
   duplicate_evidence_bindings=excluded.duplicate_evidence_bindings,
   cross_path_conflicts=excluded.cross_path_conflicts,
   orphan_evidence=excluded.orphan_evidence,
   decision=excluded.decision,
   created_at=now()
 returning id into v_id;

 return query select v_id,v_total,v_bound,v_orphan_registry,v_dup,v_cross,v_orphan_evidence,v_decision;
end;
$function$;
