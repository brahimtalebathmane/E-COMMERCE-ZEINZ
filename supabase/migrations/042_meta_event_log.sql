-- Observability log for Meta Pixel / CAPI outcomes (additive — does not replace idempotency ledgers).

create table if not exists public.meta_event_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'view_content',
      'initiate_checkout',
      'lead',
      'purchase',
      'cancelled_lead',
      'config_health',
      'emq_check',
      'pixel_load_failure'
    )
  ),
  order_id uuid references public.orders (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  event_id text not null,
  state text not null check (state in ('success', 'failed', 'skipped')),
  reason text,
  detail text,
  attempt_count int not null default 1 check (attempt_count >= 1),
  created_at timestamptz not null default now()
);

comment on table public.meta_event_log is
  'Append-only observability log for Meta Pixel/CAPI events. Idempotency remains in order_meta_dispatches / funnel_meta_dispatches / meta_*_sent flags.';

create index if not exists meta_event_log_state_created_at_idx
  on public.meta_event_log (state, created_at desc);

create index if not exists meta_event_log_order_id_idx
  on public.meta_event_log (order_id)
  where order_id is not null;

create index if not exists meta_event_log_event_id_type_idx
  on public.meta_event_log (event_id, event_type);

create index if not exists meta_event_log_event_type_created_at_idx
  on public.meta_event_log (event_type, created_at desc);

alter table public.meta_event_log enable row level security;

drop policy if exists "meta_event_log_select_monitoring" on public.meta_event_log;
create policy "meta_event_log_select_monitoring"
  on public.meta_event_log for select
  using (public.has_panel_permission('view_meta_monitoring'));

-- Grant view_meta_monitoring to existing staff who already have view_orders.
update public.profiles
set permissions = permissions || '["view_meta_monitoring"]'::jsonb
where role = 'staff'
  and permissions @> '["view_orders"]'::jsonb
  and not permissions @> '["view_meta_monitoring"]'::jsonb;

-- Meta monitoring needs order reads for stuck-order detection in the dashboard.
drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select
  using (
    public.has_panel_permission('view_orders')
    or public.has_panel_permission('view_analytics')
    or public.has_panel_permission('view_meta_monitoring')
  );

-- Supabase Realtime for live admin monitoring page.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meta_event_log'
  ) then
    alter publication supabase_realtime add table public.meta_event_log;
  end if;
end $$;
