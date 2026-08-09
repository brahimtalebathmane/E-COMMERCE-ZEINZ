-- Close the cost-price/sourcing-link leak: `products_public_read` and
-- `products_select_public` both grant `anon`/`authenticated` SELECT on every
-- column of `public.products`, including cost_price, sourcing_link,
-- affiliate_sheet_url, affiliate_fixed_commission, affiliate_sell_price,
-- affiliate_commission_type, affiliate_currency, affiliate_sku,
-- profit_calculation_start_date, sourcing_type, meta_pixel_id, and
-- deleted_at — all readable today with only the public anon key
-- (`set local role anon; select cost_price from public.products;`).
--
-- Fix: drop the two blanket policies (no anon/authenticated SELECT policy is
-- re-added on the base table — only `products_admin_write` still grants
-- admins full-row access) and expose storefront-safe columns through a view.
-- The application-level half of this fix (src/lib/products.ts, src/types)
-- must ship in the same deploy — this migration alone does not stop the app
-- itself from still asking for cost_price via select("*").
--
-- Deviation from the original audit brief: `affiliate_country` is kept
-- PUBLIC (not excluded). It is not a financial secret — it's the COD
-- Partner's target market (e.g. "Kuwait") — and
-- src/components/landing/AffiliateOrderFormModal.tsx reads it directly on
-- the public storefront to default the phone-number country and to submit
-- the order. Excluding it would break affiliate checkout, not fix a leak.

drop policy if exists products_public_read on public.products;
drop policy if exists products_select_public on public.products;

create or replace view public.products_public as
select
  id,
  slug,
  old_slugs,
  price,
  discount_price,
  display_currency,
  currency,
  media_type,
  media_url,
  secondary_media_type,
  secondary_media_url,
  tertiary_media_type,
  tertiary_media_url,
  gallery,
  default_language,
  brand_color,
  logo_url,
  whatsapp_e164,
  whatsapp_message_template,
  country_id,
  fulfillment_type,
  affiliate_country,
  test_status,
  created_at,
  name_ar, name_fr,
  hero_subtitle_ar, hero_subtitle_fr,
  header_bar_text_ar, header_bar_text_fr,
  header_offer_text_ar, header_offer_text_fr,
  header_discount_text_ar, header_discount_text_fr,
  header_promo_text_ar, header_promo_text_fr,
  header_announcement_text_ar, header_announcement_text_fr,
  header_cta_text_ar, header_cta_text_fr,
  header_bar_max_lines, header_bar_font_size_px,
  description_ar, description_fr,
  cta_text_ar, cta_text_fr,
  features_title_ar, features_title_fr,
  features_ar, features_fr,
  testimonials_title_ar, testimonials_title_fr,
  testimonials_ar, testimonials_fr,
  testimonials_badge_ar, testimonials_badge_fr,
  faq_title_ar, faq_title_fr,
  faqs_ar, faqs_fr,
  specs_title_ar, specs_title_fr,
  specs_ar, specs_fr,
  stats_section_title_ar, stats_section_title_fr,
  stats_ar, stats_fr,
  contact_title_ar, contact_title_fr,
  contact_lines_ar, contact_lines_fr,
  media_caption_ar, media_caption_fr,
  footer_note_ar, footer_note_fr,
  cta_banner_background_color, cta_banner_background_image_url, cta_banner_image_overlay,
  sticky_footer_offer_ends_at,
  sticky_footer_timer_label_ar, sticky_footer_timer_label_fr,
  sticky_footer_savings_badge_ar, sticky_footer_savings_badge_fr,
  sticky_footer_bar_bg_color, sticky_footer_badge_bg_color,
  sticky_footer_timer_box_bg_color, sticky_footer_timer_digit_color,
  sticky_footer_cta_bg_color, sticky_footer_cta_text_color,
  sticky_footer_show_timer
  -- Deliberately excluded: cost_price, sourcing_type, sourcing_link,
  -- affiliate_sheet_url, affiliate_sku, affiliate_fixed_commission,
  -- affiliate_sell_price, affiliate_commission_type, affiliate_currency,
  -- profit_calculation_start_date, meta_pixel_id, deleted_at.
from public.products
where deleted_at is null;

grant select on public.products_public to anon, authenticated;
