-- Add editable offer block fields for landing structure order.
alter table public.products
  add column if not exists offer_badge_ar text not null default '',
  add column if not exists offer_badge_fr text not null default '',
  add column if not exists offer_discount_text_ar text not null default '',
  add column if not exists offer_discount_text_fr text not null default '',
  add column if not exists offer_limited_text_ar text not null default '',
  add column if not exists offer_limited_text_fr text not null default '';
