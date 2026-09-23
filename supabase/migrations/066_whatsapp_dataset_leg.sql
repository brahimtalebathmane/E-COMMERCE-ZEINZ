-- 066_whatsapp_dataset_leg.sql
-- A WhatsApp Purchase with an attributable click id is now sent to TWO
-- destinations: the website pixel (meta_purchase_sent, unchanged) and the WABA
-- dataset, which is the only source Meta's "Maximize number of purchases through
-- messaging" goal reads. meta_purchase_sent is already true on existing orders
-- and cannot express a second destination, so the dataset leg gets its own flag.
--
-- Run this BEFORE deploying the code that writes these columns.

alter table public.orders
  add column if not exists meta_purchase_dataset_sent boolean not null default false;

-- "[<iso time>] <reason> subcode=<n> <detail>" from the last failed attempt;
-- cleared when the dataset accepts the event. Shown verbatim on /admin/meta.
alter table public.orders
  add column if not exists meta_dataset_last_error text;

-- Lease for the /admin/meta dataset resend. Meta does not deduplicate
-- business_messaging events, so two admins pressing "Resend" at once must not
-- both send the same order; each run claims an order by stamping this first.
alter table public.orders
  add column if not exists meta_dataset_resend_claimed_at timestamptz;

create index if not exists orders_dataset_pending_idx
  on public.orders (ordered_at desc)
  where meta_purchase_dataset_sent = false;

comment on column public.orders.meta_purchase_dataset_sent is
  'True once the WhatsApp dataset (business_messaging) accepted this order''s Purchase. Independent of meta_purchase_sent, which tracks the pixel.';

-- Backfill: until this migration, an attributable WhatsApp Purchase went to the
-- dataset INSTEAD of the pixel whenever the dataset was configured, and was
-- marked meta_purchase_sent. Those orders already reached the dataset. Without
-- this update they would read as a gap and the resend would send them a second
-- time — and Meta does not deduplicate business_messaging events.
--
-- Orders dispatched by the new code always leave either
-- meta_purchase_dataset_sent = true or meta_dataset_last_error set, so the
-- "last_error is null" guard makes this safe to re-run once right after the
-- deploy, to cover sales the old code dispatched in between.
update public.orders
set meta_purchase_dataset_sent = true
where meta_purchase_sent = true
  and meta_purchase_dataset_sent = false
  and meta_dataset_last_error is null
  and meta_ctwa_clid is not null
  and source = 'manual'
  and manual_sale_channel = 'whatsapp';

-- One summary row per dataset resend run, so /admin/meta can show the outcome
-- of the last run after a reload.
alter table public.meta_event_log
  drop constraint if exists meta_event_log_event_type_check;

alter table public.meta_event_log
  add constraint meta_event_log_event_type_check check (
    event_type in (
      'view_content',
      'initiate_checkout',
      'lead',
      'purchase',
      'cancelled_lead',
      'config_health',
      'emq_check',
      'pixel_load_failure',
      'dataset_resend'
    )
  );
