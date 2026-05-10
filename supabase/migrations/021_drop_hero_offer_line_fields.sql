-- Remove hero offer line copy fields (price line between testimonial and CTA); pricing remains on sticky footer.

alter table public.products drop column if exists hero_badge_ar;
alter table public.products drop column if exists hero_badge_fr;
alter table public.products drop column if exists offer_badge_ar;
alter table public.products drop column if exists offer_badge_fr;
alter table public.products drop column if exists offer_discount_text_ar;
alter table public.products drop column if exists offer_discount_text_fr;
alter table public.products drop column if exists offer_limited_text_ar;
alter table public.products drop column if exists offer_limited_text_fr;
