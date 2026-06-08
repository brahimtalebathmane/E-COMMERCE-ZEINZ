-- Per-product WhatsApp message sent after a successful order (admin landing setup).
alter table public.products
  add column if not exists whatsapp_message_template text;

comment on column public.products.whatsapp_message_template is
  'Optional template text sent to the customer via WhatsApp after order success.';
