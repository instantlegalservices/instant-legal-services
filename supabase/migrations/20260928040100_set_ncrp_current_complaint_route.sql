-- Keep the NCRP route on the currently published official complaint entry page.
update public.ils_government_route_catalog
set
  official_url='https://www.cybercrime.gov.in/Webform/Accept.aspx',
  official_domain='cybercrime.gov.in',
  source_url='https://www.cybercrime.gov.in/Webform/Accept.aspx',
  verification_status='source-checked',
  last_http_status=null,
  last_final_url=null,
  last_redirect_count=null,
  last_verified_at=null,
  verification_error=null,
  source_checked_at=now(),
  updated_at=now()
where service_code='cyber-financial-fraud';
