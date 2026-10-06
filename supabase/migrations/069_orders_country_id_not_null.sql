-- 069_orders_country_id_not_null.sql
-- Step 2 of 068. Apply ONLY after the code that sets orders.country_id on
-- every insert (storefront + WhatsApp sale) is deployed and real orders of
-- both kinds have arrived since, with NONE of them in
-- orders_country_id_autofill_log (which 068's transitional trigger fills
-- whenever an insert didn't send country_id). This migration drops that log.

-- Catches any row from the deploy window. The 068 trigger already filled
-- them, so this is expected to update 0 rows.
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

-- Strict from now on: a missing country_id is an application bug and must
-- fail the insert instead of being silently filled.
create or replace function public.orders_enforce_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_country uuid;
begin
  if new.country_id is null then
    raise exception 'orders.country_id is required (product %)', new.product_id
      using errcode = 'not_null_violation';
  end if;

  select p.country_id into product_country
  from public.products p
  where p.id = new.product_id;

  if new.country_id is distinct from product_country then
    raise exception 'orders.country_id (%) does not match the country (%) of product %',
      new.country_id, product_country, new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- The transitional trigger that wrote it is gone; so is its purpose.
drop table if exists public.orders_country_id_autofill_log;
