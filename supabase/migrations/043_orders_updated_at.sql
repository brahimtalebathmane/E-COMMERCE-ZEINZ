-- orders.updated_at was referenced by src/lib/meta/stuck-events.ts (fallback
-- timestamp for "when did this order's status last change" when
-- order_status_history has no matching row) but the column never existed,
-- breaking /admin/meta with: "column orders.updated_at does not exist".
--
-- Add it and keep it accurate automatically via trigger, since orders are
-- updated from several independent code paths (status changes, Meta flag
-- writes, WhatsApp dispatch timestamps, soft delete) and relying on every
-- call site to set it manually would be fragile.

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: created_at is the best available proxy for existing rows.
update public.orders set updated_at = created_at;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_set_updated_at on public.orders;
create trigger trg_orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();
