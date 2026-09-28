-- Harden function search paths without changing function logic.
ALTER FUNCTION public.set_client_work_progress_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_judgments_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_judgment_sources_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.search_judgments(text, integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.ils_guard_professional_public_profile()
  SET search_path = pg_catalog, public;