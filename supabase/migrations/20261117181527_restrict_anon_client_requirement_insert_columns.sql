-- Restrict anonymous business enquiries to fields supplied by the visitor.
-- Do not allow public clients to set CRM workflow, payment, assignment or private-access fields.
revoke all privileges on table public.client_requirements from anon;

grant insert (
  client_name,
  legal_matter,
  brief_requirement,
  "Souce",
  state,
  district_city,
  mobile
) on table public.client_requirements to anon;

-- Direct sequence access is unnecessary for INSERT using the identity default.
revoke all privileges on sequence public.client_requirements_id_seq from anon;
