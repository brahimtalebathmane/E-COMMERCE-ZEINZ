-- Single bilingual header promo strip (replaces separate offer/discount/promo/announcement fields in the UI).
alter table public.products
  add column if not exists header_bar_text_ar text not null default '',
  add column if not exists header_bar_text_fr text not null default '';

-- Seed new fields from legacy columns when still empty.
update public.products
set header_bar_text_ar = concat_ws(
  ' · ',
  nullif(trim(header_offer_text_ar), ''),
  nullif(trim(header_discount_text_ar), ''),
  nullif(trim(header_promo_text_ar), ''),
  nullif(trim(header_announcement_text_ar), '')
)
where trim(coalesce(header_bar_text_ar, '')) = ''
  and concat_ws(
    ' · ',
    nullif(trim(header_offer_text_ar), ''),
    nullif(trim(header_discount_text_ar), ''),
    nullif(trim(header_promo_text_ar), ''),
    nullif(trim(header_announcement_text_ar), '')
  ) <> '';

update public.products
set header_bar_text_fr = concat_ws(
  ' · ',
  nullif(trim(header_offer_text_fr), ''),
  nullif(trim(header_discount_text_fr), ''),
  nullif(trim(header_promo_text_fr), ''),
  nullif(trim(header_announcement_text_fr), '')
)
where trim(coalesce(header_bar_text_fr, '')) = ''
  and concat_ws(
    ' · ',
    nullif(trim(header_offer_text_fr), ''),
    nullif(trim(header_discount_text_fr), ''),
    nullif(trim(header_promo_text_fr), ''),
    nullif(trim(header_announcement_text_fr), '')
  ) <> '';
