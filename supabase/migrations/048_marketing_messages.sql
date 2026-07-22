-- 048_marketing_messages.sql
-- Marketing Messages: admin-only WhatsApp broadcast campaigns to past
-- customers. Two tables (campaigns, recipients); actual sending is done by
-- an always-on Railway worker (marketing-worker.js) that polls these tables
-- and shares the existing Baileys connection used for order confirmations.
-- This migration only owns schema/RLS/derived audience lookup — it never
-- sends anything itself.

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  message_text text not null,
  image_url text,
  audience_type text not null check (audience_type in ('all_confirmed', 'manual', 'by_product')),
  product_id uuid references public.products (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'completed', 'failed')),
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.marketing_campaigns is
  'One row per admin-initiated WhatsApp broadcast. The always-on Railway worker (marketing-worker.js) drains pending recipients for rows with status=sending. sent_count/failed_count/consecutive_failures are maintained by a trigger, never written directly by application code.';
comment on column public.marketing_campaigns.consecutive_failures is
  'Reset to 0 on any successful send for this campaign; the worker sets status to failed and stops processing this campaign once this reaches 3 (hardcoded in marketing-worker.js, never configurable from the admin UI).';
comment on column public.marketing_campaigns.product_id is
  'Only set when audience_type = by_product. Null otherwise.';

create index if not exists marketing_campaigns_status_idx
  on public.marketing_campaigns (status, created_at);

create table if not exists public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  phone text not null,
  customer_name text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.marketing_campaign_recipients is
  'One row per phone number targeted by a campaign. unique(campaign_id, phone) prevents sending more than once to the same number within one campaign.';

create unique index if not exists marketing_campaign_recipients_campaign_phone_idx
  on public.marketing_campaign_recipients (campaign_id, phone);

-- Worker's core poll query: does this sending campaign still have pending work?
create index if not exists marketing_campaign_recipients_pending_idx
  on public.marketing_campaign_recipients (campaign_id, status) where status = 'pending';

-- Daily-cap query: count of status='sent' rows by sent_at, across all campaigns.
create index if not exists marketing_campaign_recipients_sent_at_idx
  on public.marketing_campaign_recipients (sent_at) where status = 'sent';

-- Keep marketing_campaigns.sent_count / failed_count / consecutive_failures in
-- sync via trigger (not application code) so every writer (worker, future
-- admin tools, manual SQL fixes) stays consistent automatically.
create or replace function public.marketing_campaign_recipients_sync_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    if new.status = 'sent' then
      update public.marketing_campaigns
        set sent_count = sent_count + 1,
            consecutive_failures = 0
        where id = new.campaign_id;
    elsif new.status = 'failed' then
      update public.marketing_campaigns
        set failed_count = failed_count + 1,
            consecutive_failures = consecutive_failures + 1
        where id = new.campaign_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_campaign_recipients_sync_counters_trg
  on public.marketing_campaign_recipients;
create trigger marketing_campaign_recipients_sync_counters_trg
  after update on public.marketing_campaign_recipients
  for each row
  execute function public.marketing_campaign_recipients_sync_counters();

-- RLS: mirror the current RBAC pattern (has_panel_permission), same shape as
-- product_ad_campaigns in 044_profit_analytics_live_ad_spend.sql.
alter table public.marketing_campaigns enable row level security;

drop policy if exists "marketing_campaigns_select" on public.marketing_campaigns;
create policy "marketing_campaigns_select"
  on public.marketing_campaigns for select
  using (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaigns_insert" on public.marketing_campaigns;
create policy "marketing_campaigns_insert"
  on public.marketing_campaigns for insert
  with check (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaigns_update" on public.marketing_campaigns;
create policy "marketing_campaigns_update"
  on public.marketing_campaigns for update
  using (public.has_panel_permission('marketing_messages'))
  with check (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaigns_delete" on public.marketing_campaigns;
create policy "marketing_campaigns_delete"
  on public.marketing_campaigns for delete
  using (public.has_panel_permission('marketing_messages'));

alter table public.marketing_campaign_recipients enable row level security;

drop policy if exists "marketing_campaign_recipients_select" on public.marketing_campaign_recipients;
create policy "marketing_campaign_recipients_select"
  on public.marketing_campaign_recipients for select
  using (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaign_recipients_insert" on public.marketing_campaign_recipients;
create policy "marketing_campaign_recipients_insert"
  on public.marketing_campaign_recipients for insert
  with check (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaign_recipients_update" on public.marketing_campaign_recipients;
create policy "marketing_campaign_recipients_update"
  on public.marketing_campaign_recipients for update
  using (public.has_panel_permission('marketing_messages'))
  with check (public.has_panel_permission('marketing_messages'));

drop policy if exists "marketing_campaign_recipients_delete" on public.marketing_campaign_recipients;
create policy "marketing_campaign_recipients_delete"
  on public.marketing_campaign_recipients for delete
  using (public.has_panel_permission('marketing_messages'));

-- NOTE: the Railway worker reads/writes these two tables via its own
-- Supabase service-role client and bypasses RLS entirely, same as every
-- other service-role write path in this codebase. The policies above only
-- gate the admin panel's cookie-scoped client.

-- order_status_history has RLS enabled with zero policies (pre-existing) and
-- no index on new_status — add one, since the audience RPC below scans it.
create index if not exists order_status_history_new_status_order_id_idx
  on public.order_status_history (new_status, order_id);

-- Server-side audience resolution for the two automatic audience modes.
-- Mirrors the app's own qualification rule: an order counts if it is
-- currently confirmed, OR was ever confirmed per order_status_history.
-- DISTINCT ON (phone) ... ORDER BY phone, created_at desc gives "most recent
-- customer_name per phone" for free. Supabase's JS client cannot express
-- DISTINCT ON or a correlated EXISTS, so this lives server-side as an RPC.
create or replace function public.marketing_audience_confirmed(p_product_id uuid default null)
returns table (phone text, customer_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.phone) o.phone, o.customer_name
  from public.orders o
  where o.deleted_at is null
    and o.phone is not null
    and (p_product_id is null or o.product_id = p_product_id)
    and (
      o.status = 'confirmed'
      or exists (
        select 1 from public.order_status_history h
        where h.order_id = o.id and h.new_status = 'confirmed'
      )
    )
  order by o.phone, o.created_at desc;
$$;

revoke all on function public.marketing_audience_confirmed(uuid) from public;
grant execute on function public.marketing_audience_confirmed(uuid) to authenticated, service_role;
