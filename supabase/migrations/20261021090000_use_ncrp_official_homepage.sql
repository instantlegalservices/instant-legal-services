-- Safe NCRP route correction.
-- Use the official portal homepage as a stable entry point; users can select
-- Register a Complaint / Financial Fraud from the government portal navigation.
-- The application code also guards this route so a stale catalog value cannot
-- reintroduce the obsolete deep link before this migration is applied.
update public.ils_government_route_catalog
set
  official_url = 'https://cybercrime.gov.in/',
  official_domain = 'cybercrime.gov.in',
  source_url = 'https://cybercrime.gov.in/',
  verification_status = 'source-checked',
  last_http_status = null,
  last_final_url = null,
  last_redirect_count = null,
  last_verified_at = null,
  verification_error = null,
  source_checked_at = now(),
  updated_at = now()
where service_code = 'cyber-financial-fraud';
