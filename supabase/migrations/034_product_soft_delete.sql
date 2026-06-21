-- Soft-delete support for products (idempotent).
--
-- Deleting a product that already has customer orders fails on the
-- `orders.product_id ... on delete restrict` foreign key, which previously
-- surfaced as an unhandled 500 in the admin "edit product" server action.
-- To preserve historical orders for bookkeeping we archive such products
-- (set `deleted_at`) instead of hard-deleting them, and filter archived rows
-- out of every active storefront / admin pipeline view.

alter table public.products
  add column if not exists deleted_at timestamptz;

comment on column public.products.deleted_at is
  'Soft-delete timestamp. When set, the product is archived: hidden from the storefront, sitemap, and active admin pipeline while keeping linked orders intact for bookkeeping.';

-- Partial index keeps active-product lookups (the common case) fast.
create index if not exists products_deleted_at_active_idx
  on public.products (deleted_at)
  where deleted_at is null;
