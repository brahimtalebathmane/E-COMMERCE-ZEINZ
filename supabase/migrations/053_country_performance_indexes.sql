-- 053_country_performance_indexes.sql
-- products.country_id is now filtered on in /admin/products, /admin/orders
-- (via the products!inner join), /admin/analytics, /admin (home), and
-- /admin/marketing's product dropdown -- added in migration 051 with no
-- accompanying index. Checked every other country-related filter column
-- introduced since: countries.iso_code already has an implicit unique
-- index (051's `unique` constraint); marketing_campaigns.country_id gets
-- its own index in 052. This is the one gap.

create index if not exists products_country_id_idx
  on public.products (country_id);
