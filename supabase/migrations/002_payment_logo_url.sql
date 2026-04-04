-- Optional logo image URL for payment method (PNG, JPG, SVG)
alter table public.payment_methods
  add column if not exists payment_logo_url text;
