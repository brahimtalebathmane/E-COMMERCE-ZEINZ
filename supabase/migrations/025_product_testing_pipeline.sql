-- Product research / testing pipeline + sourcing & cost fields (idempotent).

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'product_testing_status' and n.nspname = 'public'
  ) then
    create type public.product_testing_status as enum (
      'under_research',
      'ready_for_test',
      'testing',
      'winner',
      'failed'
    );
  end if;
end $$;

alter table public.products
  add column if not exists test_status public.product_testing_status not null default 'under_research',
  add column if not exists sourcing_type text,
  add column if not exists sourcing_link text not null default '',
  add column if not exists cost_price numeric(12, 2);

alter table public.products
  drop constraint if exists products_sourcing_type_check;

alter table public.products
  add constraint products_sourcing_type_check
  check (sourcing_type is null or sourcing_type in ('local', 'import'));

comment on column public.products.test_status is 'Admin pipeline stage: research → test → winner/failed.';
comment on column public.products.sourcing_type is 'local | import — product sourcing channel.';
comment on column public.products.sourcing_link is 'Internal link (supplier sheet, Alibaba, etc.).';
comment on column public.products.cost_price is 'Internal cost in MRU for margin calculations.';

-- Existing catalog products stay visible on the storefront after migration.
update public.products
set test_status = 'winner'::public.product_testing_status
where test_status = 'under_research'::public.product_testing_status;

create index if not exists products_test_status_idx on public.products (test_status);
