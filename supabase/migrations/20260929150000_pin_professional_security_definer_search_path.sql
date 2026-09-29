-- Release-gate hardening: pin SECURITY DEFINER professional-member functions
-- to an empty search_path. Their relations are already schema-qualified.
-- This is intentionally staged on release-gate-20260929 only.

alter function public.ils_professional_member_context()
  set search_path = '';

alter function public.ils_get_professional_tool_usage()
  set search_path = '';

alter function public.ils_consume_professional_tool_use(text)
  set search_path = '';
