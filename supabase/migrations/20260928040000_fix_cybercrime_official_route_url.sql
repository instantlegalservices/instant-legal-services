-- Safely update the NCRP public entry route used by ILS official-route verification.
-- The previous Webform/Index.aspx endpoint is no longer a reliable verification target
-- and can fail TLS validation. The current official NCRP entry page is Accept.aspx.
update public.ils_government_route_catalog
set
  official_url = 'https://www.cybercrime.gov.in/Accept.aspx',
  official_domain = 'cybercrime.gov.in',
  source_url = 'https://www.cybercrime.gov.in/Accept.aspx',
  verification_status = 'source-checked',
  last_http_status = null,
  last_final_url = null,
  last_redirect_count = null,
  last_verified_at = null,
  verification_error = null,
  source_checked_at = now(),
  updated_at = now()
where service_code = 'cyber-financial-fraud';
