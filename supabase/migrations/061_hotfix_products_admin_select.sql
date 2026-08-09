-- HOTFIX: migration 057 dropped products_select_public / products_public_read
-- (qual `true`, roles anon+authenticated) to close the cost-price leak.
-- Those were, unintentionally, the ONLY policies granting SELECT on
-- public.products to a real logged-in admin/staff session too — the
-- "real" admin policy, products_admin_write (ALL, qual is_admin(auth.uid())),
-- checks the legacy public.admins table, which is and has been completely
-- empty. Every current owner/staff account lives in public.profiles, never
-- in public.admins, so is_admin() has never matched anyone.
--
-- Net effect after 057: no authenticated user (owner included) could read
-- products at all. /admin/products, the product edit/landing-setup pages,
-- and any admin query that embeds `products(...)` all returned nothing —
-- and /admin/orders uses `products!inner(...)`, so the inner join silently
-- dropped every order row too. This is what looked like "lost all data".
--
-- Fix: add a real SELECT policy for active owner/staff sessions, mirroring
-- how orders_select_admin/countries_select_admin already do it via the
-- profiles-based permission functions instead of the dead admins table.
-- Products aren't permission-gated read content the way orders/marketing
-- are (every panel role needs product names for orders, analytics, and
-- monitoring), so this grants to any active panel user rather than
-- enumerating individual has_panel_permission() checks.

create policy products_select_panel
  on public.products
  for select
  to authenticated
  using (is_active_panel_user());
