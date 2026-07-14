-- 044_profit_analytics_live_ad_spend.sql
-- Profit analytics upgrade:
--   1. Per-order delivery cost (varies by order/region), editable from the order detail view.
--   2. Product -> Meta ad campaign attribution (a product can have many campaigns; a
--      campaign belongs to exactly one product) so ad spend can be summed live from
--      the Meta Marketing API instead of hand-typed.
--   3. Daily per-product ad spend cache, refreshed live (short TTL) when the analytics
--      dashboard loads. This is also the historical source for all trend charts/sparklines.
--
-- Every statement is additive / idempotent. The old `product_ad_spend` manual ledger
-- (031/032) is intentionally left untouched — just no longer read by the dashboard.

-- 1. Per-order delivery cost. Null = not entered yet, treated as 0 in profit calculations.
alter table public.orders
  add column if not exists delivery_cost numeric(12, 2) null
    check (delivery_cost is null or delivery_cost >= 0);

comment on column public.orders.delivery_cost is
  'Per-order delivery/shipping cost (MRU), editable from the order detail view. Null = not entered, treated as 0 in profit calculations.';

-- 2. Product -> Meta campaign attribution.
create table if not exists public.product_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  meta_campaign_id text not null unique,
  label text,
  created_at timestamptz not null default now()
);

comment on table public.product_ad_campaigns is
  'Links a Meta Ads campaign to exactly one product for live ad-spend attribution. A product may have many linked campaigns.';
comment on column public.product_ad_campaigns.meta_campaign_id is
  'Meta campaign id. Globally unique — a campaign cannot be attributed to more than one product.';

create index if not exists product_ad_campaigns_product_id_idx
  on public.product_ad_campaigns (product_id);

alter table public.product_ad_campaigns enable row level security;

drop policy if exists "product_ad_campaigns_select" on public.product_ad_campaigns;
create policy "product_ad_campaigns_select"
  on public.product_ad_campaigns for select
  using (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_campaigns_insert" on public.product_ad_campaigns;
create policy "product_ad_campaigns_insert"
  on public.product_ad_campaigns for insert
  with check (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_campaigns_delete" on public.product_ad_campaigns;
create policy "product_ad_campaigns_delete"
  on public.product_ad_campaigns for delete
  using (public.has_panel_permission('view_analytics'));

-- 3. Daily per-product ad spend cache (populated only by service-role sync code).
create table if not exists public.product_ad_spend_daily (
  product_id uuid not null references public.products (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (product_id, date)
);

comment on table public.product_ad_spend_daily is
  'Per-product, per-day Meta ad spend cache. Refreshed live (short TTL) when the analytics dashboard loads, and used as the historical source for every trend chart/sparkline. Rows are overwritten (not additive) on each sync for idempotency.';

alter table public.product_ad_spend_daily enable row level security;

drop policy if exists "product_ad_spend_daily_select" on public.product_ad_spend_daily;
create policy "product_ad_spend_daily_select"
  on public.product_ad_spend_daily for select
  using (public.has_panel_permission('view_analytics'));

-- No insert/update/delete policy: all writes go through the service-role client.
