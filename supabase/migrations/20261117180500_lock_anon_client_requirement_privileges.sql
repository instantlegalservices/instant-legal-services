-- The TEST project's default table grants are broader than the Production lead contract.
-- Anonymous visitors may create enquiries only; they must not read, edit or delete lead records.
revoke all on table public.client_requirements from anon;
grant insert on table public.client_requirements to anon;
