-- 062_ctwa_attribution.sql
-- Click-to-WhatsApp (CTWA) attribution.

create table if not exists public.whatsapp_ad_clicks (
  id uuid primary key default gen_random_uuid(),
  -- E.164 digits WITHOUT the leading "+" (output of sanitizePhoneForMetaE164),
  -- so the WhatsApp JID and orders.phone can be matched after normalization.
  phone text not null,
  ctwa_clid text not null,
  ad_source_id text,
  source_url text,
  source_type text,
  clicked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_ad_clicks is
  'Click-to-WhatsApp ad clicks captured from inbound WhatsApp messages. Read when creating a manual sale to bind the click id to the order for Meta CAPI business_messaging events.';

create unique index if not exists whatsapp_ad_clicks_clid_key
  on public.whatsapp_ad_clicks (ctwa_clid);

create index if not exists whatsapp_ad_clicks_phone_clicked_at_idx
  on public.whatsapp_ad_clicks (phone, clicked_at desc);

alter table public.whatsapp_ad_clicks enable row level security;
-- No anon/authenticated policies on purpose: written by the WhatsApp worker and
-- read by Next.js server code, both on the service role (which bypasses RLS) —
-- the same posture as order_meta_dispatches.

alter table public.orders
  add column if not exists meta_ctwa_clid text;

comment on column public.orders.meta_ctwa_clid is
  'Click-to-WhatsApp click id for the conversation this order came from. When set (and META_WHATSAPP_BUSINESS_ACCOUNT_ID is configured), the Purchase CAPI event is sent with action_source=business_messaging + messaging_channel=whatsapp instead of phone_call.';
