-- 047_manual_sale_channel.sql
-- How an admin-entered offline sale happened, so the Meta CAPI Purchase event
-- can send an accurate `action_source` ("phone_call" vs "other") instead of
-- the "website" value used for real storefront checkouts. Null for
-- source='storefront' orders, where action_source is always "website".
alter table public.orders
  add column if not exists manual_sale_channel text null
    check (manual_sale_channel is null or manual_sale_channel in ('phone_call', 'other'));

comment on column public.orders.manual_sale_channel is
  'How a source=manual order was made: phone_call or other (in-person/etc). Drives Meta CAPI action_source. Null for storefront orders.';
