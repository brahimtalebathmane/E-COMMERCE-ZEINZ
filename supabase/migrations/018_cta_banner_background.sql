-- Pre-contact CTA banner (between FAQ and contact): admin-controlled background.
alter table public.products
  add column if not exists cta_banner_background_color text not null default '',
  add column if not exists cta_banner_background_image_url text not null default '',
  add column if not exists cta_banner_image_overlay numeric not null default 0.45;

comment on column public.products.cta_banner_background_color is 'Solid fill (CSS hex, e.g. #006B0C). Used when no banner image is set.';
comment on column public.products.cta_banner_background_image_url is 'Optional full-bleed banner background image URL.';
comment on column public.products.cta_banner_image_overlay is '0–1 dark overlay on banner image for contrast (ignored when no image).';
