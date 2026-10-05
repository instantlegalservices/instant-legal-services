-- Public SEO projection only.
-- Source table remains protected. No email, mobile, address, auth identity,
-- credentials or internal moderation fields are exposed.
--
-- Eligibility intentionally follows the existing server-side policy:
-- approved + verified CA/CS + public_profile=true.
-- GST/HR/associate remain excluded until the product policy is deliberately changed.

create or replace view public.ils_public_professional_seo
with (security_invoker = true)
as
select
  id,
  professional_type,
  full_name,
  state,
  city,
  specialization,
  years_of_experience,
  firm_or_organization
from public.professional_join_requests
where professional_type in ('ca','cs')
  and lower(coalesce(status,'pending')) = 'approved'
  and lower(coalesce(verification_status,'pending')) = 'approved'
  and public_profile = true
  and nullif(trim(full_name), '') is not null;

comment on view public.ils_public_professional_seo is
  'Sanitized public SEO feed for approved verified public CA/CS profiles.';

grant select on public.ils_public_professional_seo to anon;
