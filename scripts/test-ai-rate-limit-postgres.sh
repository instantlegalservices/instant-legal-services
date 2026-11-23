#!/usr/bin/env bash
set -euo pipefail

for batch in $(seq 1 10); do
  pids=()
  for request in $(seq 1 10); do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.ils_ai_rate_limit_check(repeat('c',64),1000,3600);" >/dev/null &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
done

actual=$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT request_count FROM public.ils_ai_rate_limits WHERE key_hash=repeat('c',64) AND window_seconds=3600;")
if [[ "$actual" != "100" ]]; then
  echo "FAIL: expected exactly 100 atomic concurrent increments, got $actual" >&2
  exit 1
fi

echo "PASS: 100 concurrent PostgreSQL rate-limit RPC calls produced exactly 100 increments."
