-- Disposable PostgreSQL CI only. Never run against Supabase TEST or Production.
BEGIN;

DO $test$
DECLARE
  v_hostile_def text;
  v_summary_def text;
  v_release_def text;
  v_has_assertion_column boolean;
  v_summary record;
  v_hostile record;
  v_gate_id uuid;
  v_gate_decision text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='ils_critical_path_release_proof_hostile_results'
      AND column_name='assertion_verified'
      AND is_nullable='NO'
  ) INTO v_has_assertion_column;
  IF NOT v_has_assertion_column THEN
    RAISE EXCEPTION 'Missing NOT NULL assertion_verified column';
  END IF;

  SELECT pg_get_functiondef('public.ils_run_critical_path_release_proof_hostile_matrix()'::regprocedure)
    INTO v_hostile_def;
  IF position('INSERT INTO public.ils_critical_path_release_proof_hostile_results' in upper(v_hostile_def))>0
     OR position('DELETE FROM public.ils_critical_path_release_proof_hostile_results' in upper(v_hostile_def))>0
     OR position('HOLD' in v_hostile_def)=0 THEN
    RAISE EXCEPTION 'Legacy hostile runner must not manufacture or delete results and must fail closed';
  END IF;

  SELECT pg_get_functiondef('public.ils_release_critical_path_summary()'::regprocedure)
    INTO v_summary_def;
  IF position('ils_e2e_function_deployment_registry' in v_summary_def)=0
     OR position('d.active' in v_summary_def)=0
     OR position('NOTIFICATION_E2E' in v_summary_def)=0
     OR position('PAYMENT_E2E' in v_summary_def)=0
     OR position('GOV_ROUTE_E2E' in v_summary_def)=0 THEN
    RAISE EXCEPTION 'Canonical summary lacks active deployment or path-specific proof requirements';
  END IF;

  SELECT pg_get_functiondef('public.ils_e2e_release_gate_evaluate()'::regprocedure)
    INTO v_release_def;
  IF position('ils_document_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_notification_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_professional_assignment_e2e_release_gate_decisions' in v_release_def)=0
     OR position('ils_security_execution_e2e_release_gate_decisions' in v_release_def)=0
     OR position('assertion_verified' in v_release_def)=0
     OR position('ils_critical_path_evidence_binding_integrity_audit' in v_release_def)=0
     OR position('ils_critical_path_release_proof_runs' in v_release_def)=0 THEN
    RAISE EXCEPTION 'Overall release gate is missing a mandatory independent gate';
  END IF;

  -- Calling the summary is read-only; it must report all eight inventory paths.
  SELECT * INTO v_summary FROM public.ils_release_critical_path_summary();
  IF v_summary.total_paths<>8 THEN
    RAISE EXCEPTION 'Expected 8 critical paths, observed %',v_summary.total_paths;
  END IF;

  -- The corrected legacy runner is non-mutating and must not claim PASS.
  SELECT * INTO v_hostile
  FROM public.ils_run_critical_path_release_proof_hostile_matrix();
  IF v_hostile.total_tests<>8 OR v_hostile.passed_tests<>0
     OR v_hostile.decision<>'HOLD' THEN
    RAISE EXCEPTION 'Legacy hostile runner must return 8 unexecuted tests and HOLD';
  END IF;

  -- Exercise the PL/pgSQL evaluator only in this disposable database transaction.
  -- The outer ROLLBACK guarantees no test result persists.
  v_gate_id := public.ils_e2e_release_gate_evaluate();
  SELECT decision INTO v_gate_decision
  FROM public.ils_e2e_release_gate_decisions
  WHERE id=v_gate_id;
  IF v_gate_decision<>'HOLD' THEN
    RAISE EXCEPTION 'Empty fixture must remain HOLD, observed %',v_gate_decision;
  END IF;
END;
$test$;

ROLLBACK;
