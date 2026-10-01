-- ILS Location Registry
-- LGD source identity/provenance extension.
-- Forward-only migration.
-- Existing location registry migration remains untouched.

alter table public.location_registry
  add column if not exists source_system text,
  add column if not exists source_code text,
  add column if not exists parent_source_code text;

alter table public.location_registry
  add constraint location_registry_source_system_check
  check (
    source_system is null
    or btrim(source_system) <> ''
  );

alter table public.location_registry
  add constraint location_registry_source_code_check
  check (
    source_code is null
    or btrim(source_code) <> ''
  );

alter table public.location_registry
  add constraint location_registry_parent_source_code_check
  check (
    parent_source_code is null
    or btrim(parent_source_code) <> ''
  );

create unique index if not exists
  location_registry_source_identity_unique
on public.location_registry (
  source_system,
  location_type,
  source_code
)
where source_system is not null
  and source_code is not null;
