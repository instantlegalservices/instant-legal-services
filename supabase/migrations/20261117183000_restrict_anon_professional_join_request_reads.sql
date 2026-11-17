-- Defense in depth: anonymous professional applications remain INSERT-only.
-- Public profile reads continue through the existing filtered directory views.
-- This migration deliberately does not alter RLS policies, authenticated grants,
-- registration INSERT privileges, or any Production data.

REVOKE SELECT ON TABLE public.professional_join_requests FROM anon, PUBLIC;

REVOKE SELECT (
  id,
  created_at,
  professional_type,
  full_name,
  email,
  mobile,
  membership_number,
  certificate_of_practice,
  state,
  city,
  specialization,
  years_of_experience,
  firm_or_organization,
  photo_storage_path,
  verification_status,
  status,
  public_profile,
  admin_notes,
  auth_user_id,
  address,
  extra_skills,
  aadhaar_hash,
  aadhaar_last4,
  undertaking_accepted,
  undertaking_signed_name,
  undertaking_signed_at
) ON TABLE public.professional_join_requests FROM anon, PUBLIC;

DO $$
DECLARE
  v_column text;
BEGIN
  IF has_table_privilege('anon', 'public.professional_join_requests', 'SELECT') THEN
    RAISE EXCEPTION 'anon still has table-level SELECT on professional_join_requests';
  END IF;

  FOR v_column IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professional_join_requests'
  LOOP
    IF has_column_privilege('anon', 'public.professional_join_requests', v_column, 'SELECT') THEN
      RAISE EXCEPTION 'anon still has column SELECT on professional_join_requests.%', v_column;
    END IF;
  END LOOP;
END;
$$;
