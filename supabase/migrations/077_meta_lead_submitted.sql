-- 077_meta_lead_submitted.sql
-- LeadSubmitted: one Conversions API event per Click-to-WhatsApp click, sent to
-- the WhatsApp (WABA) dataset when a WhatsApp sale is recorded. It measures the
-- step between "conversation started" and "Purchase" — how many people placed
-- an order, and so how many were lost on the confirmation call.
--
-- Additive only. Old code never reads or writes any of this.
--
-- Meta does not deduplicate business_messaging events, so the guarantee "at most
-- one LeadSubmitted per click id" is ours: the primary key on ctwa_clid is the
-- claim. A multi-line sale, a second order from the same click, two admins and a
-- retry all race for the same row; only the holder of claim_token may send.

create table if not exists public.meta_lead_submitted (
  ctwa_clid text primary key,
  -- The order the event was sent for (the first line of a multi-line sale).
  -- Nullable + set null so a hard delete never removes the "already sent" fact.
  order_id uuid references public.orders(id) on delete set null,
  manual_sale_group_id uuid,
  -- Fixed on the first claim and reused by every retry.
  event_id text not null,
  state text not null default 'claimed'
    check (state in ('claimed', 'sent', 'failed')),
  -- Compare-and-set token: a retry takes the row over only if the token it read
  -- is still the current one.
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  sent_at timestamptz,
  -- "[<iso time>] <reason> subcode=<n> <detail>" from the last failed attempt.
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meta_lead_submitted is
  'One row per Click-to-WhatsApp click id that a LeadSubmitted event was (or is being) sent for. The primary key is the once-per-click guarantee; Meta does not deduplicate business_messaging events.';

create index if not exists meta_lead_submitted_order_id_idx
  on public.meta_lead_submitted (order_id);

create index if not exists meta_lead_submitted_unsent_idx
  on public.meta_lead_submitted (claimed_at desc)
  where state <> 'sent';

alter table public.meta_lead_submitted enable row level security;
-- No anon/authenticated policies on purpose: written and read by Next.js server
-- code on the service role — same posture as order_meta_dispatches.

-- New log type for /admin/meta. Same list as 066 plus 'lead_submitted'.
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
      'dataset_resend',
      'lead_submitted'
    )
  );
