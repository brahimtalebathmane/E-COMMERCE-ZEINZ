-- Structured fields for fully editable landing wireframe sections and media slots.
alter table public.products
  add column if not exists brand_color text not null default '#006B0C',
  add column if not exists logo_url text not null default '',
  add column if not exists hero_badge_ar text not null default '',
  add column if not exists hero_badge_fr text not null default '',
  add column if not exists cta_text_ar text not null default '',
  add column if not exists cta_text_fr text not null default '',
  add column if not exists features_title_ar text not null default '',
  add column if not exists features_title_fr text not null default '',
  add column if not exists testimonials_title_ar text not null default '',
  add column if not exists testimonials_title_fr text not null default '',
  add column if not exists media_caption_ar text not null default '',
  add column if not exists media_caption_fr text not null default '',
  add column if not exists faq_title_ar text not null default '',
  add column if not exists faq_title_fr text not null default '',
  add column if not exists contact_title_ar text not null default '',
  add column if not exists contact_title_fr text not null default '',
  add column if not exists secondary_media_type text not null default 'image'
    check (secondary_media_type in ('image', 'video')),
  add column if not exists secondary_media_url text not null default '',
  add column if not exists tertiary_media_type text not null default 'image'
    check (tertiary_media_type in ('image', 'video')),
  add column if not exists tertiary_media_url text not null default '';
