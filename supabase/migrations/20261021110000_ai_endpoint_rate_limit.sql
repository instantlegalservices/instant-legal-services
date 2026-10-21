-- ILS AI endpoint rate limiting (isolated, additive).
-- Store only SHA-256 client-key hashes; never persist raw IP addresses or user IDs.
-- Apply this migration before deploying the matching ai-assistant Edge Function.
create table if not exists public.ils_ai_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_seconds integer not null check (window_seconds in (60, 3600)),
  window_started_at timestamptz not null default now(),
  request_count bigint not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_seconds)
);

alter table public.ils_ai_rate_limits enable row level security;
revoke all on public.ils_ai_rate_limits from public, anon, authenticated;

create or replace function public.ils_ai_rate_limit_check(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz;
  v_count bigint;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 1000
     or p_window_seconds not in (60, 3600) then
    return jsonb_build_object('allowed', false, 'code', 'INVALID_RATE_LIMIT_INPUT');
  end if;

  insert into public.ils_ai_rate_limits as existing
    (key_hash, window_seconds, window_started_at, request_count, updated_at)
  values (p_key_hash, p_window_seconds, now(), 1, now())
  on conflict (key_hash, window_seconds) do update
    set window_started_at = case
          when existing.window_started_at
               + make_interval(secs => p_window_seconds::double precision) <= now()
          then now() else existing.window_started_at end,
        request_count = case
          when existing.window_started_at
               + make_interval(secs => p_window_seconds::double precision) <= now()
          then 1 else least(existing.request_count + 1, 2147483647) end,
        updated_at = now()
  returning window_started_at, request_count into v_started, v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after_seconds', greatest(
      ceil(extract(epoch from (
        v_started + make_interval(secs => p_window_seconds::double precision) - now()
      )))::integer, 1
    )
  );
end;
$$;

revoke all on function public.ils_ai_rate_limit_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ils_ai_rate_limit_check(text, integer, integer) to service_role;
