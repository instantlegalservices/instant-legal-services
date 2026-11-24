-- Add a dedicated fixed-price checkout product for the nine Popular Assistance
-- intake journeys. This does not modify any existing service or price.
-- Apply only after Production schema review and explicit release approval.

do $$
declare
  v_service_id uuid;
begin
  select id into v_service_id
  from public.services
  where slug = 'ils-enquiry-fee-199'
  order by created_at asc
  limit 1;

  if v_service_id is null then
    insert into public.services (slug, name, description, category, is_active)
    values (
      'ils-enquiry-fee-199',
      'ILS Initial Enquiry & Coordination',
      'One-time initial enquiry and coordination fee for eligible Popular Assistance services. Scope and any further professional fee are disclosed separately.',
      'assistance',
      true
    )
    returning id into v_service_id;
  else
    -- This migration explicitly enables the dedicated marketplace checkout service.
    update public.services
    set is_active = true
    where id = v_service_id;
  end if;

  if not exists (
    select 1
    from public.service_prices
    where service_id = v_service_id
      and is_active = true
      and price = 199.00
      and currency = 'INR'
      and billing_type = 'one_time'
  ) then
    insert into public.service_prices
      (service_id, price, currency, billing_type, is_active)
    values
      (v_service_id, 199.00, 'INR', 'one_time', true);
  end if;
end
$$;

-- Verification (run separately after the migration):
-- select s.slug, s.is_active, p.price, p.currency, p.billing_type, p.is_active
-- from public.services s
-- join public.service_prices p on p.service_id = s.id
-- where s.slug = 'ils-enquiry-fee-199';
