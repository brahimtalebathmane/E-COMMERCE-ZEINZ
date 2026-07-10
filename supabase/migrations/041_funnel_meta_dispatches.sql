-- Pre-order funnel CAPI idempotency (InitiateCheckout before an order row exists).

create table if not exists public.funnel_meta_dispatches (
  event_id text not null,
  event_type text not null check (event_type in ('initiate_checkout')),
  product_id uuid references public.products (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, event_type)
);

alter table public.funnel_meta_dispatches enable row level security;

comment on column public.products.meta_pixel_id is
  'LEGACY — no longer used for Meta event routing. Unified pixel comes from env (NEXT_PUBLIC_META_PIXEL_ID / META_PIXEL_ID).';

comment on column public.orders.meta_pixel_id is
  'LEGACY snapshot — no longer used for Meta event routing. Unified pixel comes from env (META_PIXEL_ID).';
