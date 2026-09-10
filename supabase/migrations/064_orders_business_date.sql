-- 064_orders_business_date.sql
-- Adds an editable "business date" for each order, separate from the
-- immutable insert timestamp. created_at continues to mean "when this row
-- was inserted" and stays relied on by Meta CAPI dispatch idempotency,
-- dispatch tables and audit/communication logs — it is never edited.
-- ordered_at is the day the sale actually happened from the business's point
-- of view: it defaults to now() for every normal order, but an admin can move
-- it (e.g. entering a manual sale for a call that happened yesterday, or
-- correcting a storefront order's date). Every report, filter, grouping and
-- sort that means "when did this sale happen" now reads ordered_at, not
-- created_at.

alter table public.orders
  add column if not exists ordered_at timestamptz;

-- Backfill from each row's OWN created_at (never the migration's execution
-- time) so no historical day-grouping shifts when this column is introduced.
update public.orders
set ordered_at = created_at
where ordered_at is null;

alter table public.orders
  alter column ordered_at set default now(),
  alter column ordered_at set not null;

comment on column public.orders.ordered_at is
  'Business date of the sale — defaults to now() at insert, editable by admins afterward (e.g. backdating a manual sale, correcting a storefront order''s date). Every report, filter, grouping and sort uses this column. Contrast with created_at: the immutable row-insert timestamp, used only for audit, Meta CAPI dispatch idempotency and logs — never edited by this feature.';

create index if not exists orders_ordered_at_idx on public.orders (ordered_at desc);
