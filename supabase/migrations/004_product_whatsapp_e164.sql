-- Per-landing-page WhatsApp for orders (Mauritania +222). Digits-only E.164 without leading +.
-- Null preserves previous behavior: NEXT_PUBLIC_WHATSAPP_E164 fallback.

alter table public.products
  add column if not exists whatsapp_e164 text;

comment on column public.products.whatsapp_e164 is
  'WhatsApp number as E.164 digits (e.g. 222XXXXXXXX for Mauritania). Optional; empty uses env fallback.';
