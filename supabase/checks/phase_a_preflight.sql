-- phase_a_preflight.sql
-- READ-ONLY. Run after verify_migrations.sql shows 001–066 applied.
-- Answers the data questions Phase A depends on: can every order be given a
-- country, which currencies disagree, and whether soft-deleted orders are
-- currently leaking into the profit totals. One row per check: (check, value).

select 'orders: total' as check_name, count(*)::text as value
from public.orders

union all
select 'orders: product_id is null', count(*)::text
from public.orders where product_id is null

union all
select 'orders: product row missing', count(*)::text
from public.orders o
left join public.products p on p.id = o.product_id
where o.product_id is not null and p.id is null

union all
select 'orders: product has no country_id', count(*)::text
from public.orders o
join public.products p on p.id = o.product_id
where p.country_id is null

union all
select 'orders per country (iso: count)', coalesce(string_agg(x.iso || ': ' || x.n, ', ' order by x.iso), '')
from (
  select c.iso_code as iso, count(*)::text as n
  from public.orders o
  join public.products p on p.id = o.product_id
  join public.countries c on c.id = p.country_id
  group by c.iso_code
) x

union all
select 'orders: currency differs from country currency',
  count(*)::text
from public.orders o
join public.products p on p.id = o.product_id
join public.countries c on c.id = p.country_id
where upper(trim(o.currency)) <> upper(trim(c.currency))

union all
select 'affiliate products: affiliate_currency vs countries.currency mismatches',
  coalesce(string_agg(p.name_ar || ' [' || coalesce(p.affiliate_currency, 'NULL') || ' vs ' || c.currency || ']', '; '), 'none')
from public.products p
join public.countries c on c.id = p.country_id
where p.fulfillment_type = 'affiliate'
  and upper(trim(coalesce(p.affiliate_currency, ''))) <> upper(trim(c.currency))

union all
select 'soft-deleted orders: total', count(*)::text
from public.orders where deleted_at is not null

union all
select 'soft-deleted orders: status=shipped (counted in profit if RLS does not hide them)',
  count(*)::text
from public.orders where deleted_at is not null and status = 'shipped'

union all
select 'soft-deleted shipped orders: total_price sum by currency',
  coalesce(string_agg(x.currency || ' ' || x.s, ', '), '0')
from (
  select currency, sum(total_price)::text as s
  from public.orders where deleted_at is not null and status = 'shipped'
  group by currency
) x

union all
select 'RLS orders_select_admin hides soft-deleted rows?',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_admin'
      and coalesce(qual, '') ilike '%deleted_at%'
  ) then 'yes' else 'NO — admin reads include soft-deleted orders' end

union all
select 'archived products with shipped orders (home excludes, analytics includes)',
  count(distinct p.id)::text
from public.products p
join public.orders o on o.product_id = p.id
where p.deleted_at is not null and o.status = 'shipped'

union all
select 'profiles: role / active / permissions in use',
  coalesce(string_agg(distinct pr.role || (case when pr.is_active then '' else ' (inactive)' end) || ' ' || pr.permissions::text, ' | '), '')
from public.profiles pr

union all
select 'policies already on new Phase A objects (expect none)',
  coalesce(string_agg(tablename || '.' || policyname, ', '), 'none')
from pg_policies
where schemaname = 'public'
  and tablename in ('inventory_movements', 'treasury_accounts', 'treasury_transactions')

union all
select 'manual (WhatsApp) sales on affiliate products — never sent to the COD Partner Sheet (status: count)',
  coalesce(string_agg(x.status || ': ' || x.n, ', '), 'none')
from (
  select o.status, count(*)::text as n
  from public.orders o
  join public.products p on p.id = o.product_id
  where o.source = 'manual' and p.fulfillment_type = 'affiliate' and o.deleted_at is null
  group by o.status
) x

union all
select 'orders.country_id already exists?',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'country_id')
  then 'YES — investigate before Phase A' else 'no' end;
