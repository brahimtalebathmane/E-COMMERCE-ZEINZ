-- Landing header promo strip: optional max line count and font size (px).
alter table public.products
  add column if not exists header_bar_max_lines smallint not null default 0,
  add column if not exists header_bar_font_size_px smallint;

comment on column public.products.header_bar_max_lines is '0 = show full wrapped text; 1–12 = clamp with ellipsis.';
comment on column public.products.header_bar_font_size_px is 'Optional body font size in px for the promo strip; null = responsive theme defaults.';
