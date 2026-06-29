-- Structured audit trail for order status transitions.

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  old_status text not null,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.order_status_history is
  'Append-only log of order status changes with staff attribution.';

create index if not exists order_status_history_order_id_created_at_idx
  on public.order_status_history (order_id, created_at desc);

alter table public.order_status_history enable row level security;

comment on column public.order_status_history.changed_by is
  'Panel user (auth.users) who initiated the transition; null for system/automated changes.';
