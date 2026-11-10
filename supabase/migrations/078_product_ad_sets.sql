-- 078_product_ad_sets.sql
-- Link a Meta AD SET to a product, alongside the existing whole-campaign link
-- (product_ad_campaigns, 044), and record the ad account's total daily spend
-- so spend that no product owns becomes visible.
--
-- Why: since 2026-11-09 the Meta account is organised as one ad set per
-- product, grouped into campaigns by niche and margin. A niche campaign holds
-- several products, so it cannot be linked whole (meta_campaign_id is unique
-- in product_ad_campaigns) — those campaigns were left unlinked and their
-- spend never reached the profits page (2026-11-10: ~$25 spent, $2.15 recorded).
--
-- Additive only. Old code never reads product_ad_sets or ad_account_spend_daily
-- and keeps working unchanged; the only new rule old code can hit is the
-- exclusion trigger on product_ad_campaigns, which can only fire once an ad set
-- has been linked (impossible before the new code is deployed).
--
-- No double counting: a campaign is attributed EITHER whole (product_ad_campaigns)
-- OR through its ad sets (product_ad_sets), never both. Enforced here by a
-- trigger on both tables, serialised per campaign with a transaction-scoped
-- advisory lock so two simultaneous links (one of each kind) cannot both pass.

-- 1. Ad set -> product.
create table if not exists public.product_ad_sets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- Globally unique: one ad set belongs to exactly one product.
  meta_adset_id text not null unique check (meta_adset_id ~ '^[0-9]+$'),
  -- Read from Meta (GET /{adset_id}?fields=campaign_id) when linking, never
  -- typed by the user. An ad set cannot move to another campaign.
  meta_campaign_id text not null check (meta_campaign_id ~ '^[0-9]+$'),
  -- The ad set name as Meta reported it at link time.
  label text,
  created_at timestamptz not null default now()
);

comment on table public.product_ad_sets is
  'Links one Meta ad set to one product for live ad-spend attribution. A product may have several ad sets (and campaigns). A campaign is attributed either whole (product_ad_campaigns) or through its ad sets, never both (trigger enforce_ad_link_exclusion).';
comment on column public.product_ad_sets.meta_campaign_id is
  'Campaign the ad set belongs to, as returned by Meta at link time. Used only for the campaign/ad set exclusion rule.';

create index if not exists product_ad_sets_product_id_idx
  on public.product_ad_sets (product_id);
create index if not exists product_ad_sets_meta_campaign_id_idx
  on public.product_ad_sets (meta_campaign_id);

alter table public.product_ad_sets enable row level security;

-- Same policies as product_ad_campaigns (044).
drop policy if exists "product_ad_sets_select" on public.product_ad_sets;
create policy "product_ad_sets_select"
  on public.product_ad_sets for select
  using (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_sets_insert" on public.product_ad_sets;
create policy "product_ad_sets_insert"
  on public.product_ad_sets for insert
  with check (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_sets_delete" on public.product_ad_sets;
create policy "product_ad_sets_delete"
  on public.product_ad_sets for delete
  using (public.has_panel_permission('view_analytics'));

-- Explicit grants (product_ad_campaigns relies on Supabase's default grants,
-- which also give anon everything; anon gets nothing here).
revoke all on public.product_ad_sets from anon, authenticated;
grant select, insert, delete on public.product_ad_sets to authenticated;
grant all on public.product_ad_sets to service_role;

-- 2. Exclusion rule, both directions (product_ad_campaigns.meta_campaign_id
-- is already indexed by its unique constraint).
create or replace function public.enforce_ad_link_exclusion()
returns trigger
language plpgsql
-- Definer: the check must see every link, whatever the caller's RLS allows.
security definer
set search_path = public, pg_temp
as $$
begin
  -- Serialise per campaign: whoever comes second waits for the first to
  -- commit, then (read committed: new snapshot per statement) sees its row.
  perform pg_advisory_xact_lock(hashtextextended('ad_link_campaign:' || new.meta_campaign_id, 78));

  if tg_table_name = 'product_ad_sets' then
    if exists (select 1 from public.product_ad_campaigns c
               where c.meta_campaign_id = new.meta_campaign_id) then
      raise exception 'AD_LINK_CAMPAIGN_LINKED_WHOLE: campaign % is already linked whole to a product; unlink it before linking its ad sets', new.meta_campaign_id
        using errcode = 'P0001';
    end if;
  else
    if exists (select 1 from public.product_ad_sets s
               where s.meta_campaign_id = new.meta_campaign_id) then
      raise exception 'AD_LINK_ADSETS_LINKED: ad sets of campaign % are already linked to products; unlink them before linking the whole campaign', new.meta_campaign_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ad_link_exclusion() from public, anon, authenticated;

drop trigger if exists trg_product_ad_sets_exclusion on public.product_ad_sets;
create trigger trg_product_ad_sets_exclusion
  before insert or update of meta_campaign_id on public.product_ad_sets
  for each row execute function public.enforce_ad_link_exclusion();

drop trigger if exists trg_product_ad_campaigns_exclusion on public.product_ad_campaigns;
create trigger trg_product_ad_campaigns_exclusion
  before insert or update of meta_campaign_id on public.product_ad_campaigns
  for each row execute function public.enforce_ad_link_exclusion();

-- 3. Unlink history also records ad sets (null = a whole-campaign unlink).
alter table public.product_ad_campaign_unlinks
  add column if not exists meta_adset_id text;

-- 4. The ad account's total daily spend (level=account), written by the same
-- service-role sync as product_ad_spend_daily. Unattributed spend for a day =
-- this total minus the sum of product_ad_spend_daily for that day.
create table if not exists public.ad_account_spend_daily (
  -- Without the "act_" prefix.
  ad_account_id text not null,
  date date not null,
  -- Converted to MRU via currency_rates at fetch time (derived).
  amount numeric(12, 2) not null default 0,
  -- As Meta reported it, in the ad account's currency (record of truth).
  source_amount numeric not null default 0,
  source_currency text,
  fetched_at timestamptz not null default now(),
  primary key (ad_account_id, date)
);

comment on table public.ad_account_spend_daily is
  'Total Meta ad account spend per day (Insights level=account). Compared with product_ad_spend_daily to show spend no linked campaign or ad set accounts for. Overwritten on each sync.';

alter table public.ad_account_spend_daily enable row level security;

drop policy if exists "ad_account_spend_daily_select" on public.ad_account_spend_daily;
create policy "ad_account_spend_daily_select"
  on public.ad_account_spend_daily for select
  using (public.has_panel_permission('view_analytics'));

-- No insert/update/delete policy: all writes go through the service-role client.
revoke all on public.ad_account_spend_daily from anon, authenticated;
grant select on public.ad_account_spend_daily to authenticated;
grant all on public.ad_account_spend_daily to service_role;
