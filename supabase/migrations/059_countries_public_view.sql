-- Verified fact: `countries_select_public` (qual `is_active = true`, role
-- `public` i.e. anon+authenticated) exposes every column of an active
-- country row to anyone holding the public anon key, including
-- `meta_pixel_id_server` (confirmed: SA's server pixel was readable via
-- `set local role anon; select meta_pixel_id_server from public.countries`).
--
-- Fix: drop the blanket policy and expose a view with only the
-- storefront/staff-safe columns. `countries_select_admin` (owner-only, via
-- is_owner_user()) is untouched and remains the only path to the full row
-- including meta_pixel_id_server.
--
-- `id` is added to the view beyond the original brief's column list — it's
-- a non-sensitive UUID primary key and both current callers
-- (src/app/(store)/page.tsx, src/lib/auth/country-scope.ts) need it to
-- filter/join by country. `created_at` is kept too, for parity with the
-- existing CountryRow shape.
--
-- This also affects `src/lib/auth/country-scope.ts` (the admin
-- country-switcher used by every staff role, not just the owner) — it reads
-- the full `countries` table today via an authenticated client and must
-- move to this view in the same deploy, since non-owner staff never needed
-- meta_pixel_id_server in the first place.

drop policy if exists countries_select_public on public.countries;

create or replace view public.countries_public as
select
  id,
  iso_code,
  name_ar,
  name_fr,
  currency,
  is_active,
  meta_pixel_id_public,
  created_at
from public.countries
where is_active = true;

grant select on public.countries_public to anon, authenticated;
