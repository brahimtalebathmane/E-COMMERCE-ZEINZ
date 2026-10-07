-- 071_inventory.sql
-- Phase B: stock for OWNED products in the local-operations market
-- (Mauritania). Saudi/Kuwaiti affiliate products and orders are never touched:
-- the COD Partner holds that stock.
--
--   1. orders.shipped_at / returned_at / return_disposition, stamped by a trigger
--   2. products.low_stock_threshold
--   3. inventory_settings: the inventory go-live moment per country (set once)
--   4. stock_purchases + stock_purchase_lines (restocks)
--   5. inventory_movements: append-only ledger (on hand = sum of quantity)
--   6. sync_order_stock(): reconciles an order's movements with its state
--   7. triggers on orders that call it in the same transaction
--   8. inventory_stock view: on hand / reserved / available
--   9. RLS (reads: manage_inventory in the local-operations market; writes:
--      service role through the functions in 072 only)
--
-- Additive. Until inventory_settings has a row (the go-live, entered with the
-- opening count), sync_order_stock() never creates a movement, so the old code
-- keeps working unchanged between this migration and the deploy.

-- === 1. Order fulfilment stamps ============================================

alter table public.orders
  add column if not exists shipped_at timestamptz,
  add column if not exists returned_at timestamptz,
  add column if not exists return_disposition text;

alter table public.orders
  drop constraint if exists orders_return_disposition_check;
alter table public.orders
  add constraint orders_return_disposition_check
  check (return_disposition is null or return_disposition in ('resellable', 'damaged'));

comment on column public.orders.shipped_at is
  'First time the order became shipped (set by trg_orders_stamp_fulfillment). Null on orders shipped before migration 071 — those are always before inventory go-live and never deduct stock.';
comment on column public.orders.returned_at is
  'When a SHIPPED order became internal_return (the item physically came back). Null when the order went to internal_return without ever shipping.';
comment on column public.orders.return_disposition is
  'For returned shipped orders: resellable (back into stock, the default) or damaged (back, then written off).';

create or replace function public.orders_stamp_fulfillment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  -- Only a return of a shipped order brings an item back.
  if new.status = 'internal_return' and old.status = 'shipped' then
    if new.returned_at is null then
      new.returned_at := now();
    end if;
    if new.return_disposition is null then
      new.return_disposition := 'resellable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_stamp_fulfillment on public.orders;
create trigger trg_orders_stamp_fulfillment
  before update of status on public.orders
  for each row
  execute function public.orders_stamp_fulfillment();

-- === 2. Low-stock threshold =================================================

alter table public.products
  add column if not exists low_stock_threshold integer;

alter table public.products
  drop constraint if exists products_low_stock_threshold_check;
alter table public.products
  add constraint products_low_stock_threshold_check
  check (low_stock_threshold is null or low_stock_threshold >= 0);

comment on column public.products.low_stock_threshold is
  'Owned products: flag the product as low on stock when available quantity is at or below this. Null = no alert.';

-- === 3. Inventory go-live ===================================================

create table if not exists public.inventory_settings (
  country_id uuid primary key references public.countries(id),
  go_live_at timestamptz not null,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_settings_local_only check (public.is_local_operations_country(country_id))
);

comment on table public.inventory_settings is
  'One row per local-operations country, written once by inventory_go_live() together with the opening count. Orders shipped from go_live_at on deduct stock; earlier ones never do.';

create or replace function public.inventory_settings_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory go-live cannot be changed or removed once set'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_inventory_settings_immutable on public.inventory_settings;
create trigger trg_inventory_settings_immutable
  before update or delete on public.inventory_settings
  for each row
  execute function public.inventory_settings_immutable();

-- === 4. Restocks ============================================================

create table if not exists public.stock_purchases (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  supplier text not null default '',
  purchased_on date not null,
  extra_costs numeric(12, 2) not null default 0 check (extra_costs >= 0),
  note text,
  -- Phase C links the purchase to the treasury transaction that paid it.
  treasury_transaction_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_purchases_local_only check (public.is_local_operations_country(country_id))
);

comment on table public.stock_purchases is
  'A restock: one supplier invoice. extra_costs (shipping, customs) are spread over its lines by value into landed_unit_cost.';

create table if not exists public.stock_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.stock_purchases(id) on delete restrict,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  landed_unit_cost numeric(12, 4) not null check (landed_unit_cost >= 0)
);

create index if not exists stock_purchase_lines_purchase_id_idx
  on public.stock_purchase_lines (purchase_id);
create index if not exists stock_purchases_country_purchased_on_idx
  on public.stock_purchases (country_id, purchased_on desc);

-- === 5. Movement ledger =====================================================

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity <> 0),
  type text not null check (type in ('opening', 'purchase', 'sale_out', 'return_in', 'adjustment', 'damage')),
  order_id uuid references public.orders(id),
  purchase_line_id uuid references public.stock_purchase_lines(id),
  unit_cost numeric(12, 4),
  reason text,
  -- A later row that corrects an order's earlier movement of the same type
  -- (quantity edit, soft-delete, restore). Primary rows are unique per order.
  is_correction boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_local_only check (public.is_local_operations_country(country_id)),
  -- Primary movements have their natural sign; corrections may go either way.
  constraint inventory_movements_sign check (
    is_correction
    or type = 'adjustment'
    or (type in ('opening', 'purchase', 'return_in') and quantity > 0)
    or (type in ('sale_out', 'damage') and quantity < 0)
  ),
  constraint inventory_movements_manual_reason check (
    order_id is not null
    or type not in ('adjustment', 'damage')
    or length(trim(coalesce(reason, ''))) > 0
  )
);

comment on table public.inventory_movements is
  'Append-only stock ledger for owned products in the local-operations market. On hand = sum(quantity). Order movements are written only by sync_order_stock().';

-- Exactly once: one primary movement per (order, product, type); one opening
-- per product; one purchase movement per purchase line.
create unique index if not exists inventory_movements_order_primary_key
  on public.inventory_movements (order_id, product_id, type)
  where order_id is not null and not is_correction;
create unique index if not exists inventory_movements_opening_key
  on public.inventory_movements (product_id)
  where type = 'opening';
create unique index if not exists inventory_movements_purchase_line_key
  on public.inventory_movements (purchase_line_id)
  where purchase_line_id is not null;
create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);
create index if not exists inventory_movements_order_idx
  on public.inventory_movements (order_id)
  where order_id is not null;

create or replace function public.inventory_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'inventory_movements is append-only — record a correcting movement instead'
      using errcode = 'check_violation';
  end if;
  select fulfillment_type, country_id into p from public.products where id = new.product_id;
  if p.fulfillment_type is distinct from 'owned' or p.country_id is distinct from new.country_id then
    raise exception 'stock is tracked only for owned products of the movement''s country (product %)', new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inventory_movements_guard on public.inventory_movements;
create trigger trg_inventory_movements_guard
  before insert or update or delete on public.inventory_movements
  for each row
  execute function public.inventory_movements_guard();

-- === 6. Order → stock reconciliation =======================================

-- Computes the stock effect an order SHOULD have right now and posts only the
-- difference from what is already recorded, per (product, type):
--   sale_out  = -qty  when shipped (or returned after shipping) at/after go-live
--   return_in = +qty  when a shipped order came back at/after go-live
--               (even if it shipped before go-live: the item is physically back)
--   damage    = -qty  when that return was damaged
-- Soft-deleted orders target 0 (reversed); restoring re-applies. Calling it
-- twice is a no-op, so retries can never double-count.
create or replace function public.sync_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  golive timestamptz;
  target_sale integer := 0;
  target_return integer := 0;
  target_damage integer := 0;
begin
  -- Serialise concurrent syncs of one order (a no-op when the caller's UPDATE
  -- already holds the row lock).
  select o2.id, o2.product_id, o2.country_id, o2.status, o2.quantity, o2.deleted_at,
         o2.shipped_at, o2.returned_at, o2.return_disposition, o2.unit_cost_price,
         p.fulfillment_type
    into o
    from public.orders o2
    join public.products p on p.id = o2.product_id
   where o2.id = p_order_id
     for update of o2;
  if not found then
    return;
  end if;

  if o.fulfillment_type <> 'owned' or not public.is_local_operations_country(o.country_id) then
    return;
  end if;

  select s.go_live_at into golive from public.inventory_settings s where s.country_id = o.country_id;

  if golive is not null and o.deleted_at is null then
    if o.status in ('shipped', 'internal_return') and o.shipped_at is not null and o.shipped_at >= golive then
      target_sale := -o.quantity;
    end if;
    if o.status = 'internal_return' and o.returned_at is not null and o.returned_at >= golive then
      target_return := o.quantity;
      if o.return_disposition = 'damaged' then
        target_damage := -o.quantity;
      end if;
    end if;
  end if;

  insert into public.inventory_movements
    (country_id, product_id, quantity, type, order_id, unit_cost, reason, is_correction)
  select o.country_id,
         coalesce(t.product_id, e.product_id),
         coalesce(t.qty, 0) - coalesce(e.qty, 0),
         coalesce(t.type, e.type),
         o.id,
         o.unit_cost_price,
         case
           when e.product_id is null then format('order %s', o.status)
           else format('order changed: status=%s qty=%s%s', o.status, o.quantity,
                       case when o.deleted_at is not null then ' (deleted)' else '' end)
         end,
         e.product_id is not null
    from (values
            (o.product_id, 'sale_out'::text, target_sale),
            (o.product_id, 'return_in'::text, target_return),
            (o.product_id, 'damage'::text, target_damage)
         ) as t(product_id, type, qty)
    full outer join (
      select m.product_id, m.type, sum(m.quantity)::integer as qty
        from public.inventory_movements m
       where m.order_id = o.id
       group by m.product_id, m.type
    ) e on e.product_id = t.product_id and e.type = t.type
   where coalesce(t.qty, 0) - coalesce(e.qty, 0) <> 0;
end;
$$;

revoke all on function public.sync_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.sync_order_stock(uuid) to service_role;

-- === 7. Triggers ============================================================

create or replace function public.orders_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_order_stock(new.id);
  return null;
end;
$$;

drop trigger if exists trg_orders_sync_stock on public.orders;
create trigger trg_orders_sync_stock
  after update of status, quantity, deleted_at, return_disposition, product_id, shipped_at, returned_at
  on public.orders
  for each row
  execute function public.orders_sync_stock();

-- === 8. Stock view ==========================================================

create or replace view public.inventory_stock
with (security_invoker = true) as
select
  p.id as product_id,
  p.country_id,
  p.name_ar,
  p.deleted_at,
  p.cost_price,
  p.low_stock_threshold,
  coalesce(m.on_hand, 0)::integer as on_hand,
  coalesce(r.reserved, 0)::integer as reserved,
  (coalesce(m.on_hand, 0) - coalesce(r.reserved, 0))::integer as available
from public.products p
left join (
  select product_id, sum(quantity) as on_hand
    from public.inventory_movements
   group by product_id
) m on m.product_id = p.id
left join (
  select product_id, sum(quantity) as reserved
    from public.orders
   where status = 'confirmed' and deleted_at is null
   group by product_id
) r on r.product_id = p.id
where p.fulfillment_type = 'owned'
  and public.is_local_operations_country(p.country_id);

comment on view public.inventory_stock is
  'Owned products of the local-operations market: on_hand (ledger sum), reserved (confirmed, not yet shipped, not deleted) and available = on_hand - reserved.';

-- === 9. RLS =================================================================

alter table public.inventory_settings enable row level security;
alter table public.stock_purchases enable row level security;
alter table public.stock_purchase_lines enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists inventory_settings_select on public.inventory_settings;
create policy inventory_settings_select on public.inventory_settings
  for select to authenticated
  using (public.has_panel_permission('manage_inventory') and public.is_local_operations_country(country_id));

drop policy if exists stock_purchases_select on public.stock_purchases;
create policy stock_purchases_select on public.stock_purchases
  for select to authenticated
  using (public.has_panel_permission('manage_inventory') and public.is_local_operations_country(country_id));

drop policy if exists stock_purchase_lines_select on public.stock_purchase_lines;
create policy stock_purchase_lines_select on public.stock_purchase_lines
  for select to authenticated
  using (
    public.has_panel_permission('manage_inventory')
    and exists (
      select 1 from public.stock_purchases sp
       where sp.id = purchase_id and public.is_local_operations_country(sp.country_id)
    )
  );

drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (public.has_panel_permission('manage_inventory') and public.is_local_operations_country(country_id));

-- No insert/update/delete policies: writes go through the service-role
-- functions in 072 after the app's permission and country checks.
revoke insert, update, delete on public.inventory_settings, public.stock_purchases,
  public.stock_purchase_lines, public.inventory_movements from anon, authenticated;
revoke all on public.inventory_settings, public.stock_purchases,
  public.stock_purchase_lines, public.inventory_movements from anon;
