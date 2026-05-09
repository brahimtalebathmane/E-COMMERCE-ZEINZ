-- Sticky landing footer: countdown, colors, savings badge copy (prices remain on products.price / discount_price).

alter table public.products
  add column if not exists sticky_footer_offer_ends_at timestamptz null,
  add column if not exists sticky_footer_timer_label_ar text not null default '',
  add column if not exists sticky_footer_timer_label_fr text not null default '',
  add column if not exists sticky_footer_savings_badge_ar text not null default '',
  add column if not exists sticky_footer_savings_badge_fr text not null default '',
  add column if not exists sticky_footer_bar_bg_color text not null default '',
  add column if not exists sticky_footer_badge_bg_color text not null default '',
  add column if not exists sticky_footer_timer_box_bg_color text not null default '',
  add column if not exists sticky_footer_timer_digit_color text not null default '',
  add column if not exists sticky_footer_cta_bg_color text not null default '',
  add column if not exists sticky_footer_cta_text_color text not null default '',
  add column if not exists sticky_footer_show_timer boolean not null default true;

comment on column public.products.sticky_footer_offer_ends_at is 'When set, sticky footer shows countdown until this instant (UTC).';
comment on column public.products.sticky_footer_savings_badge_ar is 'Optional savings line; empty uses discount amount + Arabic suffix when discount_price is set.';
