-- 045_orders_note.sql
-- Free-text admin annotation per order, editable directly from the order
-- row/card in /admin/orders (not hidden behind the detail modal).
alter table public.orders add column if not exists note text null;

comment on column public.orders.note is
  'Free-text admin annotation, editable directly from the order row/card.';
