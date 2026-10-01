-- ILS Location Registry SEO foundation
-- Read-only Data API boundary for trusted CI.
-- No existing ILS tables are altered.

create table if not exists public.location_registry (
  id uuid primary key default gen_random_uuid(),

  location_type text not null
    check (
      location_type in (
        'STATE',
        'DISTRICT',
        'TEHSIL',
        'LOCAL_BODY',
        'AUTHORITY',
        'COURT'
      )
    ),

  canonical_name text not null
    check (btrim(canonical_name) <> ''),

  canonical_slug text not null
    check (
      canonical_slug = btrim(canonical_slug)
      and canonical_slug = lower(canonical_slug)
      and canonical_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),

  current_route text not null
    check (
      current_route = btrim(current_route)
      and current_route <> ''
      and length(current_route) <= 2048
      and left(current_route, 1) = '/'
      and right(current_route, 1) = '/'
      and current_route !~ '[[:cntrl:]]'
      and position(E'\\' in current_route) = 0
      and position('?' in current_route) = 0
      and position('#' in current_route) = 0
      and position('//' in current_route) = 0
      and current_route !~ '(^|/)\\.{1,2}(/|$)'
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint location_registry_current_route_unique
    unique (current_route)
);

create table if not exists public.location_registry_redirects (
  location_id uuid not null
    references public.location_registry(id)
    on delete restrict,

  route text primary key,

  redirect_to text not null
    check (
      redirect_to = btrim(redirect_to)
      and redirect_to <> ''
      and length(redirect_to) <= 2048
      and left(redirect_to, 1) = '/'
      and right(redirect_to, 1) = '/'
      and redirect_to !~ '[[:cntrl:]]'
      and position(E'\\' in redirect_to) = 0
      and position('?' in redirect_to) = 0
      and position('#' in redirect_to) = 0
      and position('//' in redirect_to) = 0
      and redirect_to !~ '(^|/)\\.{1,2}(/|$)'
    ),

  created_at timestamptz not null default now(),

  constraint location_registry_redirect_route_not_self
    check (route <> redirect_to),

  constraint location_registry_redirect_route_shape
    check (
      route = btrim(route)
      and route <> ''
      and length(route) <= 2048
      and left(route, 1) = '/'
      and right(route, 1) = '/'
      and route !~ '[[:cntrl:]]'
      and position(E'\\' in route) = 0
      and position('?' in route) = 0
      and position('#' in route) = 0
      and position('//' in route) = 0
      and route !~ '(^|/)\\.{1,2}(/|$)'
    )
);

create index if not exists location_registry_redirect_location_id_idx
  on public.location_registry_redirects(location_id);

create index if not exists location_registry_type_route_idx
  on public.location_registry(location_type, current_route);

alter table public.location_registry enable row level security;
alter table public.location_registry_redirects enable row level security;

revoke all on table public.location_registry
  from public, anon, authenticated, service_role;

revoke all on table public.location_registry_redirects
  from public, anon, authenticated, service_role;

grant select on table public.location_registry to service_role;
grant select on table public.location_registry_redirects to service_role;

create or replace function public.get_location_seo_feed()
returns table (
  id uuid,
  location_type text,
  canonical_name text,
  canonical_slug text,
  current_route text
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    lr.id,
    lr.location_type,
    lr.canonical_name,
    lr.canonical_slug,
    lr.current_route
  from public.location_registry as lr
  where lr.location_type in (
    'STATE',
    'DISTRICT',
    'TEHSIL',
    'LOCAL_BODY',
    'AUTHORITY'
  )
  order by
    lr.location_type,
    lr.current_route,
    lr.id;
$$;

create or replace function public.get_location_redirect_feed()
returns table (
  location_id uuid,
  route text,
  redirect_to text
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    lrr.location_id,
    lrr.route,
    lrr.redirect_to
  from public.location_registry_redirects as lrr
  order by
    lrr.route,
    lrr.location_id;
$$;

revoke execute on function public.get_location_seo_feed()
  from public, anon, authenticated;

revoke execute on function public.get_location_redirect_feed()
  from public, anon, authenticated;

grant execute on function public.get_location_seo_feed()
  to service_role;

grant execute on function public.get_location_redirect_feed()
  to service_role;
