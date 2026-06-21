-- 031_admin_panel_performance_indexes.sql
-- Performance: additive, idempotent indexes to keep the admin Orders and
-- Products panels loading instantly as the catalog / order history grows.
--
-- These indexes are purely additive (CREATE INDEX IF NOT EXISTS). They do not
-- alter data, constraints, RLS policies, or any existing index, so they have
-- zero functional side effects on the storefront or admin workflows.

-- Products catalog is always rendered "newest first"; back the ORDER BY so the
-- planner can avoid a full-table sort on large catalogs.
create index if not exists products_created_at_idx
  on public.products (created_at desc);

-- The product testing pipeline filters by test_status and then orders by
-- created_at. A composite index serves both the filter and the sort in one
-- pass for every pipeline tab (research / ready / winner / failed).
create index if not exists products_test_status_created_at_idx
  on public.products (test_status, created_at desc);

-- Admin orders board frequently filters / groups by status badge; pair it with
-- created_at so status-scoped, newest-first reads stay index-only.
create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);
