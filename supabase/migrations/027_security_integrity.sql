-- Security & integrity: Meta idempotency ledger, WhatsApp dedupe, dispatch locks

create table if not exists public.order_meta_dispatches (
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null check (event_type in ('lead', 'purchase', 'cancel')),
  created_at timestamptz not null default now(),
  primary key (order_id, event_type)
);

alter table public.order_meta_dispatches enable row level security;

create table if not exists public.order_whatsapp_dispatches (
  order_id uuid primary key references public.orders (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_whatsapp_dispatches enable row level security;

alter table public.orders
  add column if not exists whatsapp_post_order_sent_at timestamptz;

-- Existing data may contain duplicate whatsapp_sent rows (pre-dedupe client retries).
-- Keep the earliest log per order before enforcing uniqueness.
delete from public.order_communication_logs
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by order_id
        order by created_at asc
      ) as rn
    from public.order_communication_logs
    where event = 'whatsapp_sent'
  ) ranked
  where rn > 1
);

create unique index if not exists order_communication_logs_one_whatsapp_sent_per_order
  on public.order_communication_logs (order_id)
  where event = 'whatsapp_sent';

-- Align new dedupe columns/tables with historical successful sends.
update public.orders o
set whatsapp_post_order_sent_at = sub.first_sent_at
from (
  select order_id, min(created_at) as first_sent_at
  from public.order_communication_logs
  where event = 'whatsapp_sent'
  group by order_id
) sub
where o.id = sub.order_id
  and o.whatsapp_post_order_sent_at is null;

insert into public.order_whatsapp_dispatches (order_id, status, created_at, updated_at)
select
  order_id,
  'sent',
  min(created_at),
  min(created_at)
from public.order_communication_logs
where event = 'whatsapp_sent'
group by order_id
on conflict (order_id) do nothing;
