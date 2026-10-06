-- phase_a_followup.sql
-- READ-ONLY. One statement, one result: (check_name, value). Covers the rows
-- missing from the first preflight run, plus the lists needed for Phase A.
-- Run the WHOLE file (nothing highlighted), otherwise the editor runs only the
-- selected part.

select 1 as ord, 'RLS orders_select_admin hides soft-deleted rows?' as check_name,
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_admin'
      and coalesce(qual, '') ilike '%deleted_at%'
  ) then 'yes' else 'NO — admin reads include soft-deleted orders' end as value

union all
select 2, 'orders_select_admin policy text (exact)',
  coalesce((select qual from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_admin'), 'policy missing')

union all
select 3, 'soft-deleted orders (id | ordered_at | status | total currency | product | country)',
  coalesce(string_agg(
    o.id || ' | ' || to_char(o.ordered_at at time zone 'Africa/Nouakchott', 'YYYY-MM-DD') || ' | ' || o.status
      || ' | ' || o.total_price || ' ' || o.currency || ' | ' || p.name_ar || ' | ' || c.iso_code,
    E'\n'), 'none')
from public.orders o
join public.products p on p.id = o.product_id
join public.countries c on c.id = p.country_id
where o.deleted_at is not null

union all
select 4, 'orders whose currency differs from their country (id | ordered_at | source | status | total order-currency | country currency | product)',
  coalesce(string_agg(
    o.id || ' | ' || to_char(o.ordered_at at time zone 'Africa/Nouakchott', 'YYYY-MM-DD') || ' | ' || o.source
      || ' | ' || o.status || ' | ' || o.total_price || ' ' || o.currency || ' | ' || c.iso_code || '/' || c.currency
      || ' | ' || p.name_ar,
    E'\n'), 'none')
from public.orders o
join public.products p on p.id = o.product_id
join public.countries c on c.id = p.country_id
where upper(trim(o.currency)) <> upper(trim(c.currency))

union all
select 5, 'manual (WhatsApp) sales on affiliate products (id | ordered_at | product | country | status | qty | total | deleted?)',
  coalesce(string_agg(
    o.id || ' | ' || to_char(o.ordered_at at time zone 'Africa/Nouakchott', 'YYYY-MM-DD') || ' | ' || p.name_ar
      || ' | ' || c.iso_code || ' | ' || o.status || ' | ' || o.quantity || ' | ' || o.total_price || ' ' || o.currency
      || ' | ' || case when o.deleted_at is null then 'no' else 'DELETED' end,
    E'\n' order by o.ordered_at), 'none')
from public.orders o
join public.products p on p.id = o.product_id
join public.countries c on c.id = p.country_id
where o.source = 'manual' and p.fulfillment_type = 'affiliate'

union all
select 6, 'affiliate products (name | country | affiliate_currency | countries.currency | commission type | linked campaigns)',
  coalesce(string_agg(
    p.name_ar || ' | ' || c.iso_code || ' | ' || coalesce(p.affiliate_currency, 'NULL') || ' | ' || c.currency
      || ' | ' || coalesce(p.affiliate_commission_type, 'NULL')
      || ' | ' || (select count(*) from public.product_ad_campaigns pc where pc.product_id = p.id),
    E'\n'), 'none')
from public.products p
join public.countries c on c.id = p.country_id
where p.fulfillment_type = 'affiliate'

union all
select 7, 'currency_rates (code = MRU per unit)',
  coalesce((select string_agg(code || ' = ' || mru_per_unit, ', ' order by code) from public.currency_rates), 'empty')

union all
select 8, 'staff/owner profiles (role | active | permissions)',
  coalesce(string_agg(pr.role || ' | ' || case when pr.is_active then 'active' else 'inactive' end
    || ' | ' || pr.permissions::text, E'\n'), 'none')
from public.profiles pr

union all
select 9, 'archived products with shipped orders (name | country | shipped orders)',
  coalesce(string_agg(x.line, E'\n'), 'none')
from (
  select p.name_ar || ' | ' || c.iso_code || ' | ' || count(*) as line
  from public.products p
  join public.countries c on c.id = p.country_id
  join public.orders o on o.product_id = p.id and o.status = 'shipped' and o.deleted_at is null
  where p.deleted_at is not null
  group by p.name_ar, c.iso_code
) x

union all
select 10, 'trigger trg_products_enforce_brand_identity / function enforce_product_brand_identity',
  (case when exists (select 1 from pg_trigger where tgname = 'trg_products_enforce_brand_identity')
     then 'trigger present' else 'trigger absent' end)
  || ' / ' ||
  coalesce((select 'function body: ' || regexp_replace(p.prosrc, '\s+', ' ', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_product_brand_identity'), 'function absent')

union all
select 11, 'products with empty brand_color (what the trigger would have fixed)',
  count(*)::text
from public.products where brand_color is null or length(trim(brand_color)) = 0

union all
select 12, 'testimonial items missing name or quote (what the landing page needs)',
  count(*)::text
from public.products p,
  jsonb_array_elements(coalesce(p.testimonials_ar, '[]'::jsonb) || coalesce(p.testimonials_fr, '[]'::jsonb)) e
where jsonb_typeof(e) <> 'object' or not (e ? 'name') or not (e ? 'quote')

union all
select 13, 'Supabase CLI migration history table present?',
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'no'
  else 'yes — ' || (xpath('/table/row/n/text()', query_to_xml(
    'select count(*) as n from supabase_migrations.schema_migrations', false, false, '')))[1]::text || ' rows'
  end

order by ord;
