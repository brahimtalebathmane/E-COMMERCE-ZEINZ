-- Align live DB with app: completion_token for checkout; optional customer fields.
-- (Some deployments had NOT NULL on customer_name/phone without defaults, and were missing completion_token.)

alter table public.orders
  add column if not exists completion_token uuid not null default gen_random_uuid();

alter table public.orders
  alter column customer_name drop not null;

alter table public.orders
  alter column phone drop not null;

create unique index if not exists orders_completion_token_key on public.orders (completion_token);
