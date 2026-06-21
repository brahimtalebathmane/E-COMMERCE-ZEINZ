-- 033_product_profit_calculation_start_date.sql
-- Per-product profit calculation start date:
--   Administrators can pin a specific calendar date per product so the profit
--   analytics dashboard computes Gross Revenue, COGS, Ad Spend allocation and
--   Net Profit using ONLY the orders placed on or after that date.
--
--   When the column is NULL (the default), the dashboard keeps calculating
--   life-to-date metrics exactly as before. This change is purely additive: the
--   column is nullable with no default, so existing rows, queries and admin
--   workflows are completely unaffected.

alter table public.products
  add column if not exists profit_calculation_start_date date;

comment on column public.products.profit_calculation_start_date is
  'Optional cutoff (inclusive) for profit analytics. When set, only orders created on or after this calendar date count toward this product''s revenue/COGS/profit. NULL = life-to-date.';
