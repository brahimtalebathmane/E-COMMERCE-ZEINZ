-- 064_whatsapp_sale.sql
-- Turns the admin "manual sale" into a first-class WhatsApp sale bound to a real
-- conversation.
--
-- Until now an admin typed a phone number and the server guessed the ad click by
-- looking up whatsapp_ad_clicks for that number within 90 days. Two problems:
-- the guess can attach the wrong click, and 90 days is far outside Meta's 7-day
-- CTWA attribution window, so a matched-but-stale click id produces an event
-- that can never be credited. Picking the actual conversation removes the guess.

-- Every inbound WhatsApp conversation, not just the ones that came from an ad.
-- The admin picks from this list when recording a sale.
create table if not exists public.whatsapp_contacts (
  -- E.164 digits WITHOUT the leading "+" — the output of sanitizePhoneForMetaE164,
  -- so this joins to whatsapp_ad_clicks.phone and normalizes onto orders.phone.
  phone text primary key,
  /** WhatsApp profile name (pushName); may be absent. */
  display_name text,
  first_inbound_at timestamptz not null default now(),
  last_inbound_at timestamptz not null default now(),
  inbound_count integer not null default 1,
  -- Most recent Click-to-WhatsApp click for this contact, denormalized so the
  -- picker can show "from ad X, 2 hours ago" without a second query.
  last_ctwa_clid text,
  last_ad_source_id text,
  last_ad_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_contacts is
  'One row per phone number that has messaged the business on WhatsApp. Feeds the WhatsApp-sale conversation picker in the admin. Written by the WhatsApp worker on every inbound message; ad fields are set only when the message carried a Click-to-WhatsApp referral.';

create index if not exists whatsapp_contacts_last_inbound_at_idx
  on public.whatsapp_contacts (last_inbound_at desc);

alter table public.whatsapp_contacts enable row level security;
-- No anon/authenticated policies on purpose: written by the WhatsApp worker and
-- read by Next.js server code, both on the service role (which bypasses RLS) —
-- the same posture as order_meta_dispatches and whatsapp_ad_clicks.

/**
 * Atomic upsert for one inbound message.
 *
 * Written as a function because inbound_count has to increment and
 * last_inbound_at has to move forward monotonically — neither is expressible in
 * a plain supabase-js upsert, and a read-then-write from the worker would race
 * with itself on a burst of messages.
 *
 * Ad fields use coalesce(excluded, existing) so an ordinary follow-up message
 * never erases the click id captured on the first one.
 */
create or replace function public.record_whatsapp_inbound(
  p_phone text,
  p_display_name text,
  p_inbound_at timestamptz,
  p_ctwa_clid text,
  p_ad_source_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.whatsapp_contacts as c (
    phone, display_name, first_inbound_at, last_inbound_at, inbound_count,
    last_ctwa_clid, last_ad_source_id, last_ad_clicked_at
  )
  values (
    p_phone,
    nullif(btrim(coalesce(p_display_name, '')), ''),
    p_inbound_at, p_inbound_at, 1,
    nullif(btrim(coalesce(p_ctwa_clid, '')), ''),
    nullif(btrim(coalesce(p_ad_source_id, '')), ''),
    case when nullif(btrim(coalesce(p_ctwa_clid, '')), '') is not null
         then p_inbound_at end
  )
  on conflict (phone) do update set
    display_name       = coalesce(excluded.display_name, c.display_name),
    last_inbound_at    = greatest(c.last_inbound_at, excluded.last_inbound_at),
    first_inbound_at   = least(c.first_inbound_at, excluded.first_inbound_at),
    inbound_count      = c.inbound_count + 1,
    last_ctwa_clid     = coalesce(excluded.last_ctwa_clid, c.last_ctwa_clid),
    last_ad_source_id  = coalesce(excluded.last_ad_source_id, c.last_ad_source_id),
    last_ad_clicked_at = coalesce(excluded.last_ad_clicked_at, c.last_ad_clicked_at),
    updated_at         = now();
end;
$$;

-- Same posture as migration 058: only the service role may call it.
revoke execute on function public.record_whatsapp_inbound(text, text, timestamptz, text, text)
  from anon, authenticated, public;
grant  execute on function public.record_whatsapp_inbound(text, text, timestamptz, text, text)
  to service_role;

-- Seed the picker from ad clicks already captured, so the feature is not blank
-- on the day it ships.
insert into public.whatsapp_contacts (
  phone, first_inbound_at, last_inbound_at, inbound_count,
  last_ctwa_clid, last_ad_source_id, last_ad_clicked_at
)
select
  c.phone,
  min(c.clicked_at),
  max(c.clicked_at),
  count(*)::int,
  (array_agg(c.ctwa_clid order by c.clicked_at desc))[1],
  (array_agg(c.ad_source_id order by c.clicked_at desc))[1],
  max(c.clicked_at)
from public.whatsapp_ad_clicks c
group by c.phone
on conflict (phone) do nothing;

-- All admin-entered sales now come from a WhatsApp conversation. 'phone_call'
-- and 'other' stay allowed so historical rows keep validating; new rows write
-- 'whatsapp'.
alter table public.orders
  drop constraint if exists orders_manual_sale_channel_check;

alter table public.orders
  add constraint orders_manual_sale_channel_check
  check (manual_sale_channel is null
         or manual_sale_channel in ('whatsapp', 'phone_call', 'other'));

comment on column public.orders.manual_sale_channel is
  'How a source=manual order was made. New sales are always ''whatsapp'' (recorded against a real conversation); ''phone_call'' and ''other'' are retained for historical rows. Drives Meta CAPI action_source: business_messaging when a CTWA click id is bound, otherwise chat.';
