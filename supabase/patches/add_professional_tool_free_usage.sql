-- ILS professional-member tool allowance
-- 50 overall free tool uses after professional signup/login.
-- Public/non-member tool behavior is unchanged.
-- Existing paid report/Print/PDF/payment architecture is untouched.

create table if not exists public.ils_professional_tool_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profession text not null default 'advocate' check (profession in ('advocate','ca','cs')),
  free_limit integer not null default 50 check (free_limit > 0 and free_limit <= 1000),
  free_used integer not null default 0 check (free_used >= 0 and free_used <= free_limit),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ils_professional_tool_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_slug text not null,
  created_at timestamptz not null default now()
);

create index if not exists ils_professional_tool_usage_events_user_created_idx
  on public.ils_professional_tool_usage_events(user_id, created_at desc);

alter table public.ils_professional_tool_usage enable row level security;
alter table public.ils_professional_tool_usage_events enable row level security;
revoke all on public.ils_professional_tool_usage from anon, authenticated;
revoke all on public.ils_professional_tool_usage_events from anon, authenticated;

create or replace function public.ils_professional_member_context()
returns table(is_member boolean, profession text)
language plpgsql stable security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); app_profession text:=lower(trim(coalesce(auth.jwt()->'app_metadata'->>'profession','')));
begin
  if uid is null then return query select false,null::text; return; end if;
  if app_profession in ('ca','cs','advocate') then return query select true,app_profession; return; end if;
  if exists(select 1 from public.advocate_registrations ar where ar.auth_user_id=uid and lower(coalesce(ar.status,'pending')) not in ('rejected','cancelled')) then
    return query select true,'advocate'::text; return;
  end if;
  return query select false,null::text;
end;
$$;

create or replace function public.ils_get_professional_tool_usage()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); member record; usage_row record;
begin
  if uid is null then return jsonb_build_object('ok',false,'eligible',false,'code','NOT_AUTHENTICATED'); end if;
  select * into member from public.ils_professional_member_context() limit 1;
  if not coalesce(member.is_member,false) then return jsonb_build_object('ok',true,'eligible',false); end if;
  insert into public.ils_professional_tool_usage(user_id,profession) values(uid,member.profession)
    on conflict(user_id) do update set profession=excluded.profession,updated_at=now();
  select free_limit,free_used,profession into usage_row from public.ils_professional_tool_usage where user_id=uid;
  return jsonb_build_object('ok',true,'eligible',true,'profession',usage_row.profession,'free_limit',usage_row.free_limit,'used',usage_row.free_used,'remaining',greatest(usage_row.free_limit-usage_row.free_used,0));
end;
$$;

create or replace function public.ils_consume_professional_tool_use(p_tool_slug text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); member record; usage_row record; slug text:=left(trim(coalesce(p_tool_slug,'')),120);
begin
  if uid is null then return jsonb_build_object('ok',true,'eligible',false,'code','NOT_AUTHENTICATED'); end if;
  if slug='' then return jsonb_build_object('ok',false,'eligible',true,'code','INVALID_TOOL'); end if;
  select * into member from public.ils_professional_member_context() limit 1;
  if not coalesce(member.is_member,false) then return jsonb_build_object('ok',true,'eligible',false); end if;
  insert into public.ils_professional_tool_usage(user_id,profession) values(uid,member.profession)
    on conflict(user_id) do update set profession=excluded.profession,updated_at=now();
  update public.ils_professional_tool_usage
    set free_used=free_used+1,profession=member.profession,updated_at=now()
    where user_id=uid and free_used<free_limit
    returning free_limit,free_used,profession into usage_row;
  if not found then
    select free_limit,free_used,profession into usage_row from public.ils_professional_tool_usage where user_id=uid;
    return jsonb_build_object('ok',false,'eligible',true,'code','FREE_LIMIT_REACHED','profession',usage_row.profession,'free_limit',usage_row.free_limit,'used',usage_row.free_used,'remaining',0,'message','Your 50 free ILS professional tool uses have been used.');
  end if;
  insert into public.ils_professional_tool_usage_events(user_id,tool_slug) values(uid,slug);
  return jsonb_build_object('ok',true,'eligible',true,'profession',usage_row.profession,'free_limit',usage_row.free_limit,'used',usage_row.free_used,'remaining',greatest(usage_row.free_limit-usage_row.free_used,0));
end;
$$;

revoke all on function public.ils_professional_member_context() from public;
revoke all on function public.ils_get_professional_tool_usage() from public;
revoke all on function public.ils_consume_professional_tool_use(text) from public;
grant execute on function public.ils_professional_member_context() to authenticated;
grant execute on function public.ils_get_professional_tool_usage() to authenticated;
grant execute on function public.ils_consume_professional_tool_use(text) to authenticated;
