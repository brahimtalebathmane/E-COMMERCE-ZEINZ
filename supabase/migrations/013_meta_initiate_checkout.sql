alter table public.orders
  add column if not exists meta_initiate_checkout_sent boolean not null default false;

