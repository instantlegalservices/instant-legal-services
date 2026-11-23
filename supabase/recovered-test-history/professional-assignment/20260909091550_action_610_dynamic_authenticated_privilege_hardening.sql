DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN (
        'admin_get_associate_application','calculate_work_match_score','get_fair_work_priority','suggest_associate_work',
        'ils_professional_assignment_mutation_telemetry_aggregate','ils_run_minimum_sufficient_mix_optimizer',
        'run_ils_business_digital_twin','run_ils_capacity_stress','run_ils_cashflow_stress','run_ils_six_crore_model',
        'run_ils_stress_scenario','find_ils_optimal_growth_path','get_ils_growth_command_snapshot','get_ils_scale_decision'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated', r.sig);
  END LOOP;
END
$do$;