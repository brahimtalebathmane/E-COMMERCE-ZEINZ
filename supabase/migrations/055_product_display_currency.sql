-- 055_product_display_currency.sql
-- Adds an optional, admin-editable display label for how a product's
-- currency is written next to its price on the customer-facing landing
-- page and the order-success page (e.g. "أوقية", "UM", "dh" instead of the
-- raw ISO code). Display-only: it never touches orders.currency, Meta
-- Pixel/CAPI payloads, profit/analytics currency grouping, the Google Sheet
-- export, or any admin-panel money figure — those all keep using the
-- product's real country currency (countries.currency).

alter table public.products
  add column if not exists display_currency text null;

comment on column public.products.display_currency is
  'Free-text label shown next to the price on the landing and order-success pages only (e.g. "أوقية", "UM"). Purely cosmetic — never affects orders.currency, Meta events, profit/analytics, or the affiliate Google Sheet export. Null or empty falls back to the product''s country ISO currency code.';
