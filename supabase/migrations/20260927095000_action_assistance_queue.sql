create table if not exists public.ils_action_assistance_queue (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'associate' check (mode='associate'),
  problem text,
  official_route text,
  official_url text,
  customer_name text,
  customer_mobile text,
  customer_state text,
  customer_city text,
  status text not null default 'pending_assignment' check (status in ('pending_assignment','assigned','in_progress','qa_hold','qa_pass','completed','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  customer_visible_note text,
  internal_note text,
  qa_checked_at timestamptz,
  qa_checked_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ils_action_assistance_queue enable row level security;
drop policy if exists "action_assistance_owner_select" on public.ils_action_assistance_queue;
create policy "action_assistance_owner_select" on public.ils_action_assistance_queue for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "action_assistance_admin_all" on public.ils_action_assistance_queue;
create policy "action_assistance_admin_all" on public.ils_action_assistance_queue for all to authenticated using (public.ils_is_admin()) with check (public.ils_is_admin());
grant select on public.ils_action_assistance_queue to authenticated;
grant all on public.ils_action_assistance_queue to authenticated;

create or replace function public.ils_enqueue_action_assistance()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_order_id uuid;
begin
  if new.status='paid' and coalesce(old.status,'') <> 'paid' and lower(coalesce(new.details->>'mode',''))='associate' then
    select o.id into v_order_id from public.orders o where o.service_request_id=new.id order by o.created_at desc limit 1;
    insert into public.ils_action_assistance_queue
      (service_request_id,order_id,user_id,problem,official_route,official_url,customer_name,customer_mobile,customer_state,customer_city,customer_visible_note)
    values
      (new.id,v_order_id,new.user_id,left(coalesce(new.details->>'problem',''),3000),left(coalesce(new.details->>'official_route',''),200),left(coalesce(new.details->>'official_url',''),1000),left(coalesce(new.details->>'name',''),200),left(coalesce(new.details->>'mobile',''),30),left(coalesce(new.details->>'state',''),100),left(coalesce(new.details->>'city',''),100),'Paid associate request received. Awaiting assignment.')
    on conflict (service_request_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ils_enqueue_action_assistance on public.service_requests;
create trigger trg_ils_enqueue_action_assistance after update of status on public.service_requests for each row execute function public.ils_enqueue_action_assistance();