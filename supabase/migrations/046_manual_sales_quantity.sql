-- 046_manual_sales_quantity.sql
-- Adds quantity support (units per order line) and manual/offline sale
-- tracking. `quantity` applies to every order (default 1, matching today's
-- implicit single-unit behavior); `source`/`manual_sale_group_id` are only
-- populated for admin-entered offline sales, which insert one order row per
-- product line and share a group id so the admin UI can present them as one
-- sale while every other system (state machine, Meta CAPI dispatch, profit
-- calc) keeps treating each row as a normal single-product order.
alter table public.orders
  add column if not exists quantity int not null default 1 check (quantity >= 1),
  add column if not exists source text not null default 'storefront'
    check (source in ('storefront', 'manual')),
  add column if not exists manual_sale_group_id uuid null;

comment on column public.orders.quantity is
  'Units of product_id in this order line; total_price already reflects unit_price * quantity.';
comment on column public.orders.source is
  'storefront = customer checkout (default); manual = admin-entered offline sale.';
comment on column public.orders.manual_sale_group_id is
  'Shared id across order rows created from the same admin manual-sale submission (null for storefront orders and single-line manual sales).';
