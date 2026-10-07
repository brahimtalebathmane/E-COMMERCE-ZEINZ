-- phase_a_step5_autofill.sql
-- READ-ONLY. Phase A step 5: after deploying the code that sets
-- orders.country_id, confirms every insert path sends it, using real orders.
-- 068's transitional trigger writes an order to orders_country_id_autofill_log
-- whenever an insert arrived WITHOUT country_id.
--
-- Set deployed_at below to the time the Netlify deploy went live (UTC, or with
-- an explicit offset), then run the whole file.
--
-- Ready for 069 when: both a 'storefront' and a 'manual' row appear, and
-- filled_by_trigger is 0 on every row.

with params as (
  select timestamptz '2026-10-07 01:54:00+00' as deployed_at
)
select
  o.source,
  count(*) as orders_since_deploy,
  count(l.order_id) as filled_by_trigger,
  max(o.created_at) as newest_order_at
from public.orders o
cross join params
left join public.orders_country_id_autofill_log l on l.order_id = o.id
where o.created_at >= params.deployed_at
group by o.source
order by o.source;
