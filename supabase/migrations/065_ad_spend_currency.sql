-- Ad spend as Meta actually reported it, so the stored MRU figure is always
-- re-derivable and a rate change never silently rewrites history.
alter table public.product_ad_spend_daily
  add column if not exists source_amount numeric,
  add column if not exists source_currency text;

comment on column public.product_ad_spend_daily.amount is
  'Spend converted to MRU using currency_rates at fetch time. Derived — source_amount/source_currency are the record of truth.';

-- Conversion rates, admin-maintained. No rate is invented: a currency with no
-- row here cannot be converted, and the UI must say so rather than guess.
create table if not exists public.currency_rates (
  code text primary key,
  mru_per_unit numeric not null check (mru_per_unit > 0),
  updated_at timestamptz not null default now()
);

insert into public.currency_rates (code, mru_per_unit) values
  ('MRU', 1),
  ('USD', 43)
on conflict (code) do nothing;

alter table public.currency_rates enable row level security;

create policy currency_rates_select_admin on public.currency_rates
  for select
  using (public.has_panel_permission('view_analytics'));

revoke all on public.currency_rates from anon, authenticated;
grant select on public.currency_rates to authenticated;
grant all on public.currency_rates to service_role;

-- Records an unlink event so a step change in a product's ad-spend series has
-- a visible, dated explanation instead of looking like an unexplained jump
-- (see ad-spend-sync.ts: unlinking deliberately keeps historical spend rows).
create table if not exists public.product_ad_campaign_unlinks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  meta_campaign_id text not null,
  label text,
  unlinked_at timestamptz not null default now()
);

create index if not exists product_ad_campaign_unlinks_product_id_idx
  on public.product_ad_campaign_unlinks (product_id, unlinked_at);

alter table public.product_ad_campaign_unlinks enable row level security;

create policy product_ad_campaign_unlinks_select_admin on public.product_ad_campaign_unlinks
  for select
  using (public.has_panel_permission('view_analytics'));

revoke all on public.product_ad_campaign_unlinks from anon, authenticated;
grant select on public.product_ad_campaign_unlinks to authenticated;
grant all on public.product_ad_campaign_unlinks to service_role;
