-- Re-apply the least-privilege boundary for environments where the original
-- shared limiter migration was already applied before this hardening.
alter table public.ils_ai_rate_limits enable row level security;
revoke all on table public.ils_ai_rate_limits from public, anon, authenticated, service_role;

create or replace function public.ils_ai_rate_limit_check(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz;
  v_count bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 1000
     or p_window_seconds is null or p_window_seconds not in (60, 3600) then
    raise exception 'invalid AI rate-limit input' using errcode = '22023';
  end if;

  insert into public.ils_ai_rate_limits as current_row
    (key_hash, window_seconds, window_started_at, request_count, updated_at)
  values (p_key_hash, p_window_seconds, v_now, 1, v_now)
  on conflict (key_hash, window_seconds) do update
    set window_started_at = case
          when current_row.window_started_at
               + pg_catalog.make_interval(secs => p_window_seconds::double precision) <= v_now
          then v_now else current_row.window_started_at end,
        request_count = case
          when current_row.window_started_at
               + pg_catalog.make_interval(secs => p_window_seconds::double precision) <= v_now
          then 1 else current_row.request_count + 1 end,
        updated_at = v_now
  returning window_started_at, request_count into v_started, v_count;

  -- Bounded stale-row cleanup on every call. The updated_at index keeps
  -- selection bounded; SKIP LOCKED avoids waiting on concurrent limiter calls.
  delete from public.ils_ai_rate_limits as stale
   where (stale.key_hash, stale.window_seconds) in (
     select candidate.key_hash, candidate.window_seconds
       from public.ils_ai_rate_limits as candidate
      where candidate.updated_at < v_now - interval '2 hours'
      order by candidate.updated_at
      limit 100
      for update skip locked
   );

  return pg_catalog.jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after_seconds', greatest(
      ceil(extract(epoch from (
        v_started + pg_catalog.make_interval(secs => p_window_seconds::double precision) - v_now
      )))::integer, 1
    )
  );
end;
$$;

revoke all on function public.ils_ai_rate_limit_check(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.ils_ai_rate_limit_check(text, integer, integer) to service_role;
