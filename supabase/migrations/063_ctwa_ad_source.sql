-- 063_ctwa_ad_source.sql
-- Denormalizes the ad id onto the order so "which ad produced which sale" is a
-- single grouped query, not a join through whatsapp_ad_clicks. Keeping it on the
-- order also means the report survives any future cleanup of the click table.

alter table public.orders
  add column if not exists meta_ad_source_id text;

comment on column public.orders.meta_ad_source_id is
  'Meta ad id (externalAdReply.sourceId) of the Click-to-WhatsApp ad whose conversation produced this order. Captured alongside meta_ctwa_clid when a manual sale is recorded; null for storefront orders and for chats that did not come from an ad.';

-- Report groups by ad within a date range; status is filtered in the same pass.
create index if not exists orders_meta_ad_source_id_created_at_idx
  on public.orders (meta_ad_source_id, created_at desc)
  where meta_ad_source_id is not null;

-- The clicks side of the funnel: conversations started per ad.
create index if not exists whatsapp_ad_clicks_ad_source_id_clicked_at_idx
  on public.whatsapp_ad_clicks (ad_source_id, clicked_at desc)
  where ad_source_id is not null;
