-- 069_orders_country_id_not_null.sql
-- Step 2 of 068: orders.country_id becomes NOT NULL.
--
-- The trigger keeps filling a missing country_id from the order's product as
-- a PERMANENT safety net: an insert path that forgets to send it must never
-- block a customer order. Every such fill is still recorded in
-- orders_country_id_autofill_log (kept, no longer temporary), so a forgotten
-- path shows up there instead of failing silently. NOT NULL holds because the
-- BEFORE INSERT trigger runs before the constraint is checked.
--
-- An EXPLICIT country_id that disagrees with the product is still rejected:
-- that is wrong data, not missing data, and filling it in would hide the bug.
-- Both insert paths read the country from the very product row they insert,
-- so this can't happen from current code.

-- Rows from before the deploy were already filled by the 068 trigger, so this
-- is expected to update 0 rows.
update public.orders o
set country_id = p.country_id
from public.products p
where p.id = o.product_id
  and o.country_id is null;

do $$
declare
  missing int;
begin
  select count(*) into missing from public.orders where country_id is null;
  if missing > 0 then
    raise exception 'Aborting: % order(s) still have no country_id', missing;
  end if;
end $$;

alter table public.orders
  alter column country_id set not null;

create or replace function public.orders_enforce_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_country uuid;
begin
  select p.country_id into product_country
  from public.products p
  where p.id = new.product_id;

  if new.country_id is null then
    -- Safety net: fill from the product and record it. Expected to stay empty;
    -- a row in the log means an insert path forgot to send country_id.
    new.country_id := product_country;
    insert into public.orders_country_id_autofill_log (order_id, source)
    values (new.id, new.source)
    on conflict (order_id) do nothing;
  elsif new.country_id is distinct from product_country then
    raise exception 'orders.country_id (%) does not match the country (%) of product %',
      new.country_id, product_country, new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.orders_enforce_country() is
  'Keeps orders.country_id equal to its product''s country. A missing value is filled from the product (never blocks an order) and logged in orders_country_id_autofill_log; an explicit mismatch is rejected.';

comment on table public.orders_country_id_autofill_log is
  'Orders whose insert did not send country_id, filled by trg_orders_enforce_country. Permanent since 069. Should stay empty for orders created after 2026-10-07 01:54 UTC (the Phase A deploy); any newer row means an insert path forgot country_id.';
