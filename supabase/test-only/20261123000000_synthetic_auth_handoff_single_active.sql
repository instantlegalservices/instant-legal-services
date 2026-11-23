-- TEST ONLY. Do not apply to Production.
-- The deployed handoff issuer performs a check-then-insert sequence. This
-- partial unique index makes the one-ISSUED-handoff-per-synthetic-user rule
-- atomic under concurrent requests.
do $$
begin
  if to_regclass('public.ils_test_synthetic_auth_handoffs') is null then
    raise exception 'Required TEST-only table public.ils_test_synthetic_auth_handoffs is missing';
  end if;

  if exists (
    select 1
    from public.ils_test_synthetic_auth_handoffs
    where status = 'ISSUED'
    group by synthetic_user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate ISSUED synthetic handoffs exist; reconcile them before creating the unique index';
  end if;
end;
$$;

create unique index if not exists
  ils_test_synthetic_auth_handoffs_one_issued_per_user_uidx
on public.ils_test_synthetic_auth_handoffs (synthetic_user_id)
where status = 'ISSUED';

-- Verification:
-- select synthetic_user_id, count(*)
-- from public.ils_test_synthetic_auth_handoffs
-- where status = 'ISSUED'
-- group by synthetic_user_id
-- having count(*) > 1;
-- Expected: zero rows.
