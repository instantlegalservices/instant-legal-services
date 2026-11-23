-- Shared AI rate limits for both public AI Edge Function endpoints.
-- Only keyed HMAC-SHA-256 identity hashes are stored; raw IPs/user IDs never reach Postgres.
create table if not exists public.ils_ai_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_seconds integer not null check (window_seconds in (60, 3600)),
  window_started_at timestamptz not null default now(),
  request_count bigint not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_seconds)
);

create index if not exists ils_ai_rate_limits_updated_at_idx
  on public.ils_ai_rate_limits (updated_at);

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

  -- Bounded-retention sweep, indexed by updated_at.
  if v_count % 256 = 0 then
    delete from public.ils_ai_rate_limits
     where updated_at < v_now - interval '2 hours';
  end if;

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
