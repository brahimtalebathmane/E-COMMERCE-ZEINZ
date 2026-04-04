-- All monetary amounts are Mauritanian Ouguiya (MRU). Single-currency enforcement.

alter table public.orders
  add column if not exists currency text;

update public.orders set currency = 'MRU' where currency is null;

alter table public.orders
  alter column currency set default 'MRU',
  alter column currency set not null;

alter table public.orders
  drop constraint if exists orders_currency_mru_check;

alter table public.orders
  add constraint orders_currency_mru_check check (currency = 'MRU');

alter table public.products
  add column if not exists currency text;

update public.products set currency = 'MRU' where currency is null;

alter table public.products
  alter column currency set default 'MRU',
  alter column currency set not null;

alter table public.products
  drop constraint if exists products_currency_mru_check;

alter table public.products
  add constraint products_currency_mru_check check (currency = 'MRU');
