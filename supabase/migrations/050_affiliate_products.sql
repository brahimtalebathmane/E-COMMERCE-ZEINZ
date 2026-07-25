-- 050_affiliate_products.sql
-- Adds the "Affiliate (COD Partner)" product/order side. COD Partner owns,
-- confirms, ships and delivers affiliate products; we only market them and
-- forward each order to COD Partner via a Google Sheet, tracking profit
-- ourselves. All new columns are nullable/defaulted so existing owned
-- products and orders are unaffected.

-- === products ===============================================================

alter table public.products
  add column if not exists fulfillment_type text not null default 'owned'
    check (fulfillment_type in ('owned', 'affiliate'));

comment on column public.products.fulfillment_type is
  'owned = we confirm/ship/deliver (COD, MRU). affiliate = COD Partner owns fulfillment; we only market and forward orders to their Google Sheet.';

alter table public.products
  add column if not exists affiliate_commission_type text null
    check (affiliate_commission_type is null or affiliate_commission_type in ('fixed', 'set_price'));

comment on column public.products.affiliate_commission_type is
  'Only set when fulfillment_type=affiliate. fixed = we earn affiliate_fixed_commission per shipped order. set_price = we earn affiliate_sell_price - cost_price - affiliate_other_costs.';

alter table public.products
  add column if not exists affiliate_sku text null;

comment on column public.products.affiliate_sku is
  'COD Partner SKU for this product. Required for affiliate products; written to the Google Sheet on every order.';

alter table public.products
  add column if not exists affiliate_country text null;

comment on column public.products.affiliate_country is
  'Affiliate product target country (e.g. Kuwait). Written to the Google Sheet Country column and used as the default phone country code on the landing page.';

alter table public.products
  add column if not exists affiliate_currency text null;

comment on column public.products.affiliate_currency is
  'Affiliate product currency (e.g. KWD). Written to the Google Sheet and used for this product''s own order/profit totals — never summed with MRU.';

alter table public.products
  add column if not exists affiliate_sheet_url text null;

comment on column public.products.affiliate_sheet_url is
  'Google Sheet URL that affiliate orders for this product are appended to. Multiple products may share one sheet URL.';

alter table public.products
  add column if not exists affiliate_fixed_commission numeric null;

comment on column public.products.affiliate_fixed_commission is
  'Commission earned per shipped order when affiliate_commission_type=fixed. Unused otherwise.';

alter table public.products
  add column if not exists affiliate_sell_price numeric null;

comment on column public.products.affiliate_sell_price is
  'Price charged to the customer when affiliate_commission_type=set_price. cost_price (COD Partner''s reported cost) is subtracted from this to derive profit. Unused otherwise.';

-- Replace the MRU-only currency check: owned products stay MRU-locked;
-- affiliate products may use any non-empty currency (their own, e.g. KWD).
alter table public.products
  drop constraint if exists products_currency_mru_check;

alter table public.products
  add constraint products_currency_check check (
    (fulfillment_type = 'owned' and currency = 'MRU')
    or (fulfillment_type = 'affiliate' and length(trim(currency)) > 0)
  );

-- === orders ==================================================================

alter table public.orders
  add column if not exists affiliate_address text null;

comment on column public.orders.affiliate_address is
  'Full delivery address collected on affiliate order forms. Null for owned orders.';

alter table public.orders
  add column if not exists affiliate_country text null;

comment on column public.orders.affiliate_country is
  'Country submitted with an affiliate order (defaults from the product''s affiliate_country, editable by the customer). Null for owned orders.';

alter table public.orders
  add column if not exists affiliate_city text null;

comment on column public.orders.affiliate_city is
  'City collected on affiliate order forms. Null for owned orders.';

alter table public.orders
  add column if not exists affiliate_other_costs numeric null
    check (affiliate_other_costs is null or affiliate_other_costs >= 0);

comment on column public.orders.affiliate_other_costs is
  'Extra costs COD Partner reports after the sale, for set_price affiliate orders. Entered by admin when finalizing costs.';

alter table public.orders
  add column if not exists affiliate_costs_finalized boolean not null default false;

comment on column public.orders.affiliate_costs_finalized is
  'For set_price affiliate orders: profit is only counted once this is true (admin has entered affiliate_other_costs), even if status is already shipped. Ignored for owned and fixed-commission affiliate orders.';

-- Relax the MRU-only currency check on orders. Owned orders still get
-- currency='MRU' from application code (src/app/api/orders/route.ts hardcodes
-- it); affiliate orders carry the product's own affiliate_currency. The DB
-- no longer enforces MRU-only so both product types can share this table.
alter table public.orders
  drop constraint if exists orders_currency_mru_check;

alter table public.orders
  add constraint orders_currency_not_empty_check check (length(trim(currency)) > 0);
