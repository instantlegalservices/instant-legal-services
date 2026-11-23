#!/usr/bin/env bash
set -euo pipefail
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

# Two concurrent callbacks for one token: exactly one may consume the handoff.
pids=()
for n in 1 2; do
  psql -Atq -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.ils_test_consume_synthetic_auth_handoff('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',repeat('a',64));" > "$tmp_dir/$n.out" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
true_count=$(awk '$0=="t" {n++} END {print n+0}' "$tmp_dir"/*.out)
false_count=$(awk '$0=="f" {n++} END {print n+0}' "$tmp_dir"/*.out)
if [[ "$true_count" != "1" || "$false_count" != "1" ]]; then
  echo "FAIL: expected one consume and one replay denial, got true=$true_count false=$false_count" >&2
  exit 1
fi

status=$(psql -Atq -v ON_ERROR_STOP=1 -c "SELECT status FROM public.ils_test_synthetic_auth_handoffs WHERE id='20000000-0000-0000-0000-000000000001';")
if [[ "$status" != "CONSUMED" ]]; then
  echo "FAIL: concurrent consume did not persist CONSUMED status" >&2
  exit 1
fi

# Operator revocation holds its row lock first; a concurrent callback must wait
# and then observe active=false instead of consuming the still-issued handoff.
PGAPPNAME=operator-revocation-lock psql -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
UPDATE public.ils_test_synthetic_provision_operators
SET active=false
WHERE operator_user_id='10000000-0000-0000-0000-000000000001';
SELECT pg_sleep(1);
COMMIT;
SQL
revoke_pid=$!
locked=false
for attempt in $(seq 1 40); do
  active_sleep=$(psql -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='operator-revocation-lock' AND state='active' AND query ILIKE '%pg_sleep(1)%';")
  if [[ "$active_sleep" -ge 1 ]]; then locked=true; break; fi
  sleep 0.05
done
if [[ "$locked" != "true" ]]; then
  echo "FAIL: operator revocation transaction did not acquire its lock in time" >&2
  exit 1
fi
revoked=$(psql -Atq -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.ils_test_consume_synthetic_auth_handoff('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',repeat('d',64));" 2>/dev/null || true)
wait "$revoke_pid"
if [[ "$revoked" != "f" ]]; then
  echo "FAIL: callback was not denied after operator revocation: $revoked" >&2
  exit 1
fi
remaining=$(psql -Atq -v ON_ERROR_STOP=1 -c "SELECT status FROM public.ils_test_synthetic_auth_handoffs WHERE id='20000000-0000-0000-0000-000000000004';")
if [[ "$remaining" != "ISSUED" ]]; then echo "FAIL: revoked operator consumed handoff"; exit 1; fi

echo "PASS: concurrent callback replay and operator-revocation race are denied atomically."
