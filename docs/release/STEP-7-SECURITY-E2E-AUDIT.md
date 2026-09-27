# ILS Step 7 — Security Execution Audit

Date: 2026-09-27

## One-move result

Security preflight: READY, violations=0.

A live privilege self-test exposed an allowlist mismatch. The audit identified five TEST/evidence SECURITY DEFINER functions that had anonymous/public EXECUTE exposure:
- ils_document_e2e_real_evidence_bind
- ils_is_active_test_provision_operator_v1
- ils_test_capture_professional_auth_proof
- ils_test_judgment_repro_create_fixture
- ils_test_judgment_repro_process

Safe hardening applied: revoked anonymous/public EXECUTE while preserving authenticated EXECUTE.

Reverification confirms all five now have:
anon=false, authenticated=true, public=false.

The security-definer allowlist was also updated for the audited intentional authenticated functions. The regression guard still reports an allowlist-state mismatch, so SECURITY_EXECUTION_E2E is not promoted to GO. No false release claim was made.

The broader Supabase advisor still reports many RLS-no-policy informational findings and SECURITY DEFINER exposure findings; these are not blindly mass-modified because many are deliberate service/RPC surfaces and changing them without per-function authorization analysis could break working flows.

Payment/QR-barcode chain was untouched.
