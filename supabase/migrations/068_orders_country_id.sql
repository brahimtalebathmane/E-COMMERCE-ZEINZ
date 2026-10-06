-- 068_orders_country_id.sql
-- Gives every order its own country, copied from its product, following the
-- 051 pattern (add nullable -> backfill -> fail loudly -> constrain).
-- Treasury and reconciliation need to filter orders by market directly;
-- existing pages keep joining through products and are unaffected.
--
-- Two-step rollout. This migration leaves the column NULLABLE and installs a
-- transitional trigger that fills it from the product, so the storefront keeps
-- taking orders between applying this and deploying the code that sends
-- country_id explicitly. 069 (run AFTER that deploy) sets NOT NULL and makes
-- the trigger reject a missing value instead of filling it.
--
-- Also fixes the three orders stored with currency 'SARL' (a typo copied from
-- products.affiliate_currency before 051) and makes every order currency a
-- 3-letter ISO 4217 code from now on. Meta Lead / Purchase / CancelledLead
-- (pixel and CAPI) all send orders.currency as is.

-- === 1. Currency: SARL -> SAR =============================================

-- Only the three rows found by supabase/checks/phase_a_followup.sql (all
-- cancelled storefront orders on a Saudi product) may be rewritten. Anything
-- else carrying SARL must be looked at by hand, so abort instead.
do $$
declare
  unexpected int;
begin
  select count(*) into unexpected
  from public.orders o
  join public.products p on p.id = o.product_id
  join public.countries c on c.id = p.country_id
  where o.currency = 'SARL'
    and not (o.status = 'cancelled' and o.source = 'storefront' and c.iso_code = 'SA');

  if unexpected > 0 then
    raise exception 'Aborting: % SARL order(s) are not cancelled Saudi storefront orders', unexpected;
  end if;
end $$;

update public.orders
set currency = 'SAR'
where currency = 'SARL';

-- No order may disagree with its market's currency or carry a non-ISO code.
do $$
declare
  mismatched int;
  non_iso int;
begin
  select count(*) into mismatched
  from public.orders o
  join public.products p on p.id = o.product_id
  join public.countries c on c.id = p.country_id
  where upper(trim(o.currency)) <> upper(trim(c.currency));

  select count(*) into non_iso
  from public.orders
  where currency !~ '^[A-Z]{3}$';

  if mismatched > 0 or non_iso > 0 then
    raise exception
      'Aborting: % order(s) differ from their country currency, % order(s) have a non-ISO currency',
      mismatched, non_iso;
  end if;
end $$;

-- Format only, not "equals countries.currency": the storefront writes 'MRU'
-- for owned orders itself, and tying orders to an editable countries row
-- would make a typo on the Countries screen block every new order.
alter table public.orders
  drop constraint if exists orders_currency_iso_check;
alter table public.orders
  add constraint orders_currency_iso_check check (currency ~ '^[A-Z]{3}$');

-- === 2. orders.country_id ==================================================

alter table public.orders
  add column if not exists country_id uuid references public.countries(id);

comment on column public.orders.country_id is
  'Market of this order, fixed at creation: always equal to its product''s country_id at insert time (enforced by trg_orders_enforce_country). Set explicitly by every insert path (storefront POST /api/orders, admin WhatsApp sale).';

update public.orders o
set country_id = p.country_id
from public.products p
where p.id = o.product_id
  and o.country_id is null;

-- Fail loudly — never default to Mauritania. An order without a product, or
-- whose product has no country, must be investigated by hand.
do $$
declare
  no_product int;
  no_country int;
begin
  select count(*) into no_product
  from public.orders o
  left join public.products p on p.id = o.product_id
  where p.id is null;

  select count(*) into no_country
  from public.orders
  where country_id is null;

  if no_product > 0 or no_country > 0 then
    raise exception
      'Aborting: % order(s) have no product row, % order(s) have no country_id after backfill',
      no_product, no_country;
  end if;
end $$;

create index if not exists orders_country_id_ordered_at_idx
  on public.orders (country_id, ordered_at desc);

-- TEMPORARY — dropped by 069. One row per order the transitional trigger had
-- to fill because the insert didn't send country_id. After the deploy, new
-- orders landing here mean an insert path still doesn't set it; an empty
-- table across real orders of both kinds is what clears 069 to run. Lets the
-- deploy be verified on real traffic instead of test orders, which would send
-- real Lead events to Meta.
create table if not exists public.orders_country_id_autofill_log (
  order_id uuid primary key,
  source text,
  filled_at timestamptz not null default now()
);

alter table public.orders_country_id_autofill_log enable row level security;
revoke all on public.orders_country_id_autofill_log from anon, authenticated;

-- An order's country must match its product's country at insert time, and
-- can't be rewritten afterwards to point elsewhere. Security definer (like the
-- one below) so the check sees every row regardless of the caller's RLS.
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
    -- TRANSITIONAL — removed by 069. Covers code deployed before this
    -- migration, which does not send country_id yet.
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

drop trigger if exists trg_orders_enforce_country on public.orders;
create trigger trg_orders_enforce_country
  before insert or update of country_id, product_id on public.orders
  for each row
  execute function public.orders_enforce_country();

-- === 3. Products with orders keep their country ============================

-- A product that already has orders can't move to another country: its
-- orders (and their currency) belong to the original market. Selling the
-- same item elsewhere means a new product row. Security definer: a staff
-- member with manage_products but no order permission sees no orders through
-- RLS, and the check must not pass just because of that.
create or replace function public.products_block_country_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.country_id is distinct from old.country_id
     and exists (select 1 from public.orders o where o.product_id = old.id) then
    raise exception 'Product % has orders; its country cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_block_country_change on public.products;
create trigger trg_products_block_country_change
  before update of country_id on public.products
  for each row
  execute function public.products_block_country_change();
