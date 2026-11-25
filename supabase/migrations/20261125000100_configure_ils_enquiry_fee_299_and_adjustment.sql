-- Configure the existing ILS enquiry product at ₹299 and make its fee credit adjustable.
-- Existing orders retain their original totals; only new orders use the updated service price.
alter table public.service_prices
  add column if not exists fee_adjustment_enabled boolean not null default false,
  add column if not exists fee_adjustment_amount numeric(12,2) not null default 0;

do $$
declare
  v_service_id uuid;
  v_price_column text;
  v_rows integer;
begin
  select id into v_service_id
  from public.services
  where slug = 'ils-enquiry-fee-199'
  order by created_at asc
  limit 1;

  if v_service_id is null then
    raise exception 'ILS_ENQUIRY_SERVICE_NOT_FOUND';
  end if;

  select column_name into v_price_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'service_prices'
    and column_name in ('price', 'amount')
  order by case when column_name = 'price' then 0 else 1 end
  limit 1;

  if v_price_column is null then
    raise exception 'SERVICE_PRICE_COLUMN_NOT_FOUND';
  end if;

  execute format(
    'update public.service_prices
       set %I = 299.00,
           fee_adjustment_enabled = true,
           fee_adjustment_amount = 299.00
     where service_id = $1 and is_active = true',
    v_price_column
  ) using v_service_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'ACTIVE_ILS_ENQUIRY_PRICE_NOT_FOUND';
  end if;
end
$$;
