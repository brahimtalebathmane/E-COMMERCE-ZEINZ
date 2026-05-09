-- Add fully editable landing header fields and unlock per-product logo management.
alter table public.products
  add column if not exists header_offer_text_ar text not null default '',
  add column if not exists header_offer_text_fr text not null default '',
  add column if not exists header_discount_text_ar text not null default '',
  add column if not exists header_discount_text_fr text not null default '',
  add column if not exists header_promo_text_ar text not null default '',
  add column if not exists header_promo_text_fr text not null default '',
  add column if not exists header_announcement_text_ar text not null default '',
  add column if not exists header_announcement_text_fr text not null default '',
  add column if not exists header_cta_text_ar text not null default '',
  add column if not exists header_cta_text_fr text not null default '';

create or replace function public.enforce_product_brand_identity()
returns trigger
language plpgsql
as $$
begin
  -- Keep the global brand color locked, but allow each landing page logo URL.
  new.brand_color := '#006B0C';
  return new;
end;
$$;
