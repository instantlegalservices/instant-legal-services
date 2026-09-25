revoke all on public.ils_test_synthetic_professional_auth_provisioning from anon,authenticated;
revoke all on public.ils_test_synthetic_professional_auth_handoffs from anon,authenticated;
revoke all on public.ils_test_synthetic_professional_auth_evidence from anon,authenticated;
revoke all on function public.ils_test_capture_professional_auth_proof() from public;
grant execute on function public.ils_test_capture_professional_auth_proof() to authenticated;