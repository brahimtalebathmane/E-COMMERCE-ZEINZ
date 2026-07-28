-- 051_countries.sql
-- Formalizes "country" into a real business entity: bilingual name, ISO code
-- (reused directly as react-phone-number-input's defaultCountry), currency,
-- and per-country Meta Pixel IDs (public/server). Every product now belongs
-- to exactly one country instead of a free-text affiliate_country string.
-- products.affiliate_country / affiliate_currency are left in place (still
-- written by the affiliate order form and Google Sheet export) — a future
-- cleanup migration can retire them once every read path goes through
-- countries instead.

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_fr text not null,
  iso_code text not null unique,
  currency text not null,
  meta_pixel_id_public text null,
  meta_pixel_id_server text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.countries is
  'One row per market the store sells into. iso_code is alpha-2 (compatible with react-phone-number-input Country type). currency is the ISO 4217 code used for that market''s own totals. meta_pixel_id_public/server let each country fire its own Meta Pixel instead of the single global env-var pixel.';

alter table public.countries enable row level security;

-- Public (anon) read of active countries — the storefront geo-filter and the
-- phone-country picker both need this without an authenticated session.
create policy "countries_select_public"
  on public.countries for select
  using (is_active = true);

-- Admin read includes inactive rows (the countries admin screen needs to
-- show/edit disabled countries too, not just active ones).
create policy "countries_select_admin"
  on public.countries for select
  using (public.is_owner_user());

create policy "countries_insert_admin"
  on public.countries for insert
  with check (public.is_owner_user());

create policy "countries_update_admin"
  on public.countries for update
  using (public.is_owner_user());

create policy "countries_delete_admin"
  on public.countries for delete
  using (public.is_owner_user());

-- === products.country_id ====================================================

alter table public.products
  add column if not exists country_id uuid references public.countries(id);

comment on column public.products.country_id is
  'Market this product belongs to. owned products are always Mauritania; affiliate products point at whichever country the admin picked in the Countries screen. Drives the storefront geo-filter, admin dashboard country scoping, and per-country Meta Pixel routing.';

-- Seed Mauritania (every owned product's home market) and Saudi Arabia (the
-- one live affiliate product today). SA's currency is hardcoded to the
-- correct ISO 4217 code (SAR) rather than reused from products.affiliate_currency,
-- which holds a typo'd 'SARL' on the live row — that legacy column is left
-- untouched, only the new countries.currency gets the corrected value.
insert into public.countries (name_ar, name_fr, iso_code, currency)
values
  ('موريتانيا', 'Mauritanie', 'MR', 'MRU'),
  ('السعودية', 'Arabie saoudite', 'SA', 'SAR')
on conflict (iso_code) do nothing;

-- Defensive fallback: backfill any other distinct affiliate_country value
-- that might exist on live product rows but isn't covered above yet, so no
-- product is left without a country before the NOT NULL constraint.
insert into public.countries (name_ar, name_fr, iso_code, currency)
select distinct
  p.affiliate_country,
  p.affiliate_country,
  p.affiliate_country,
  coalesce(nullif(trim(p.affiliate_currency), ''), 'USD')
from public.products p
where p.affiliate_country is not null
  and trim(p.affiliate_country) <> ''
  and p.affiliate_country not in (select iso_code from public.countries)
on conflict (iso_code) do nothing;

update public.products
set country_id = (select id from public.countries where iso_code = 'MR')
where fulfillment_type = 'owned' and country_id is null;

update public.products
set country_id = (select id from public.countries where iso_code = public.products.affiliate_country)
where fulfillment_type = 'affiliate' and country_id is null and affiliate_country is not null;

-- Sanity gate: refuse to add NOT NULL if any product was left without a
-- country (e.g. an affiliate product with a blank affiliate_country) so the
-- migration fails loudly instead of silently locking bad data in.
do $$
declare
  missing_count int;
begin
  select count(*) into missing_count from public.products where country_id is null;
  if missing_count > 0 then
    raise exception 'Aborting: % product(s) have no country_id after backfill', missing_count;
  end if;
end $$;

alter table public.products
  alter column country_id set not null;
