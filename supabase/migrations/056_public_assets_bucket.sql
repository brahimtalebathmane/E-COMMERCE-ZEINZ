-- 056_public_assets_bucket.sql
-- Product/landing/marketing images have been stored as 5-year signed URLs
-- in the `user-assets` bucket (private). That bucket also holds real
-- customer data (payment-receipt uploads from a retired feature, under
-- `receipts/` and `form-files/` — orders.receipt_image_url is legacy and
-- unwritten today, but the files themselves are still there), so it cannot
-- be flipped to public. A signed URL also breaks every stored image at
-- once if the Supabase JWT signing key is ever rotated.
--
-- `public-assets` is a new, separate bucket for admin-uploaded landing/
-- marketing images ONLY (the "products", "testimonials", "cta-banner",
-- "landing-logos", "marketing" folders from user-assets — see the one-off
-- rewrite script that migrates existing objects + rewrites the stored
-- URLs). Public reads need no RLS policy (the `public` flag handles that);
-- writes only ever happen through the service-role client in
-- /api/admin/upload-image, which bypasses RLS entirely.

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;
