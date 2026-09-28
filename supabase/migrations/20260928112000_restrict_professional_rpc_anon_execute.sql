-- Restrict professional-member RPCs to authenticated callers.
REVOKE EXECUTE ON FUNCTION public.ils_consume_professional_tool_use(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ils_get_professional_tool_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ils_professional_member_context() FROM anon;