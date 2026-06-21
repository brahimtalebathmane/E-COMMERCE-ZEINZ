-- 032_profit_analytics_ad_spend.sql
-- Profit analytics dashboard support:
--   1. New "internal_return" order status for accurate bookkeeping. This status
--      is intentionally ISOLATED from Meta CAPI: the application layer only
--      fires CancelledLead on the 'cancelled' status, so moving an order to
--      'internal_return' never emits a cancellation/refund event to Meta.
--   2. A per-product manual ad spend ledger used to compute net profit:
--          Net Profit = Gross Revenue - (COGS + Ad Spend)
--
-- Every statement is additive / idempotent. The status constraint is rebuilt to
-- include the new value without dropping any existing value, so historical rows
-- and existing admin/storefront workflows are unaffected.

-- 1. Extend the order status check constraint with 'internal_return'.
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders add constraint orders_status_check
  check (status in (
    'pending',
    'confirmed',
    'shipped',
    'cancelled',
    'requires_human_intervention',
    'internal_return'
  ));

-- 2. Manual per-product advertising spend (cumulative MRU). One row per product;
--    administrators edit the running total from the analytics dashboard.
create table if not exists public.product_ad_spend (
  product_id uuid primary key references public.products (id) on delete cascade,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.product_ad_spend is
  'Manually maintained cumulative advertising spend (MRU) per product for profit analytics.';
comment on column public.product_ad_spend.amount is
  'Cumulative ad spend in MRU. Subtracted (with COGS) from gross revenue to derive net profit.';

alter table public.product_ad_spend enable row level security;

drop policy if exists "product_ad_spend_select_admin" on public.product_ad_spend;
drop policy if exists "product_ad_spend_insert_admin" on public.product_ad_spend;
drop policy if exists "product_ad_spend_update_admin" on public.product_ad_spend;
drop policy if exists "product_ad_spend_delete_admin" on public.product_ad_spend;

create policy "product_ad_spend_select_admin"
  on public.product_ad_spend for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "product_ad_spend_insert_admin"
  on public.product_ad_spend for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "product_ad_spend_update_admin"
  on public.product_ad_spend for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "product_ad_spend_delete_admin"
  on public.product_ad_spend for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
