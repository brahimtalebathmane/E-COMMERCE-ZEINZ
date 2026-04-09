-- Append-only audit log for order lifecycle + WhatsApp notifications (service role writes only).
create table if not exists public.order_communication_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists order_communication_logs_order_id_idx
  on public.order_communication_logs (order_id);

create index if not exists order_communication_logs_created_at_idx
  on public.order_communication_logs (created_at desc);

alter table public.order_communication_logs enable row level security;
