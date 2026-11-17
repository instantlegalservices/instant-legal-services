-- Anonymous visitors may submit a lead row, but must not read or advance its identity sequence directly.
-- Identity INSERT remains supported by PostgreSQL without granting direct sequence access.
revoke all on sequence public.client_requirements_id_seq from anon;
