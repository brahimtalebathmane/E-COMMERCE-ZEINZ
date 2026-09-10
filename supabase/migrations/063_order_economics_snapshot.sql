-- 063_order_economics_snapshot.sql
-- Snapshots the economics of each order at creation time so a later edit to a
-- product's price/cost/affiliate-commission terms can never retroactively
-- change historical profit. Previously every profit calculation read
-- products.cost_price / affiliate_fixed_commission / affiliate_sell_price /
-- affiliate_commission_type LIVE at report time — editing those fields
-- silently rewrote months of already-reported profit.
-- profit_calculation_start_date (033) was a partial workaround for this; it
-- stays, but this snapshot is the real fix.
--
-- All five columns are nullable: existing rows get a one-time backfill below
-- from products' CURRENT values (the best available approximation for
-- historical data, since no snapshot existed before now), and application
-- code (src/lib/analytics/profit.ts) falls back to reading products live
-- whenever a snapshot column is null — so orders created before this
-- migration (or any future row inserted without these fields for some
-- reason) behave exactly as they do today.

alter table public.orders
  add column if not exists unit_price numeric null;

comment on column public.orders.unit_price is
  'Selling price per single unit at order creation (total_price / quantity). Snapshot only — not read by profit calculations (total_price is already the per-order revenue figure); kept for order-line auditing/display.';

alter table public.orders
  add column if not exists unit_cost_price numeric null;

comment on column public.orders.unit_cost_price is
  'products.cost_price at the moment this order was created. Profit analytics use this (falling back to the product''s current cost_price when null, e.g. orders created before this column existed) so editing a product''s cost price never changes the COGS of past orders.';

alter table public.orders
  add column if not exists affiliate_commission_type_at_order text null
    check (affiliate_commission_type_at_order is null or affiliate_commission_type_at_order in ('fixed', 'set_price'));

comment on column public.orders.affiliate_commission_type_at_order is
  'products.affiliate_commission_type at the moment this order was created. Profit analytics use this (falling back to the product''s current value when null) so changing a product''s commission model never retro-converts past orders.';

alter table public.orders
  add column if not exists affiliate_fixed_commission_at_order numeric null;

comment on column public.orders.affiliate_fixed_commission_at_order is
  'products.affiliate_fixed_commission at the moment this order was created. Used by profit analytics in place of the product''s current value (fallback when null) so past fixed-commission orders keep their original commission.';

alter table public.orders
  add column if not exists affiliate_sell_price_at_order numeric null;

comment on column public.orders.affiliate_sell_price_at_order is
  'products.affiliate_sell_price at the moment this order was created. Used by profit analytics in place of the product''s current value (fallback when null) so past set_price orders keep their original sell price.';

-- One-time historical backfill from each order's product, at CURRENT
-- product values — the closest available approximation, since no per-order
-- snapshot existed before this migration. Every number the dashboard shows
-- today must not move as a result of this backfill (verified separately).
update public.orders o
set
  unit_price = round(o.total_price / greatest(o.quantity, 1), 2),
  unit_cost_price = p.cost_price,
  affiliate_commission_type_at_order = p.affiliate_commission_type,
  affiliate_fixed_commission_at_order = p.affiliate_fixed_commission,
  affiliate_sell_price_at_order = p.affiliate_sell_price
from public.products p
where p.id = o.product_id
  and o.unit_price is null;
