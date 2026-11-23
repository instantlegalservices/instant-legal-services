#!/usr/bin/env bash
set -euo pipefail

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

pids=()
for request in $(seq 1 100); do
  psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.ils_ai_rate_limit_check(repeat('c',64),10,3600);" > "$tmp_dir/$request.out" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

allowed=$(grep -h -c '"allowed": true' "$tmp_dir"/*.out | awk '{sum += $1} END {print sum+0}')
denied=$(grep -h -c '"allowed": false' "$tmp_dir"/*.out | awk '{sum += $1} END {print sum+0}')
actual=$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT request_count FROM public.ils_ai_rate_limits WHERE key_hash=repeat('c',64) AND window_seconds=3600;")

if [[ "$allowed" != "10" || "$denied" != "90" || "$actual" != "100" ]]; then
  echo "FAIL: expected 10 allowed, 90 denied, 100 atomic increments; got allowed=$allowed denied=$denied count=$actual" >&2
  exit 1
fi

echo "PASS: 100 concurrent requests at limit 10 produced exactly 10 allowed, 90 denied and 100 atomic increments."
