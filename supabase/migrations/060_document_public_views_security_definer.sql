-- The Supabase security advisor flags products_public and countries_public
-- as ERROR-level "Security Definer View" findings. This is the expected,
-- intentional shape of both views, not an oversight:
--
-- RLS operates on ROWS, not columns — there is no RLS policy that can grant
-- anon "read products but never cost_price". The only way to hide specific
-- columns from anon while still letting them read the rest is a view that
-- runs with the view owner's privileges (the default for a plain
-- `create view`, i.e. what the linter calls "security definer") and simply
-- never selects the sensitive columns in its definition. Making these views
-- `security_invoker = true` would re-apply the base table's RLS per caller
-- — since anon has zero SELECT policy left on `products`/`countries` after
-- migrations 057/059, that would make the views return no rows at all to
-- anon, breaking the storefront entirely.
--
-- The actual security boundary is therefore: (1) the view's fixed,
-- hand-picked column list (see 057_products_public_view.sql /
-- 059_countries_public_view.sql) never includes cost_price, sourcing_link,
-- affiliate_sheet_url, affiliate_fixed_commission, affiliate_sell_price,
-- affiliate_commission_type, affiliate_currency, affiliate_sku,
-- profit_calculation_start_date, sourcing_type, meta_pixel_id, deleted_at,
-- or meta_pixel_id_server; (2) the view's WHERE clause (deleted_at is null
-- / is_active = true) reproduces the only row-level restriction that
-- mattered; (3) only SELECT is granted on the view, and only to
-- anon/authenticated — no INSERT/UPDATE/DELETE path exists through it.
-- Verified empirically (2026-08-09): `set local role anon; select
-- cost_price from products_public;` errors with "column does not exist";
-- `select count(*) from products_public;` returns the expected 27
-- non-deleted rows.

comment on view public.products_public is
  'Storefront-safe subset of products, intentionally security-definer (bypasses base-table RLS) to hide cost/sourcing/affiliate-commission columns from anon by omission rather than row filtering. See migration 060 for the full rationale.';

comment on view public.countries_public is
  'Storefront/staff-safe subset of countries, intentionally security-definer (bypasses base-table RLS) to hide meta_pixel_id_server from anon/non-owner staff by omission rather than row filtering. See migration 060 for the full rationale.';
