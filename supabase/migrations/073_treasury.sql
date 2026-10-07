-- 073_treasury.sql
-- Phase C: money for the local-operations market (Mauritania), MRU only.
--
-- How cash moves in this business: the owner's own delivery agent delivers
-- each shipped order, collects the cash and hands it over later (cash or a
-- mobile wallet), usually keeping his delivery fee. Until that settlement the
-- money for shipped orders is held by the agent.
--
--   treasury_settings          go-live (once), with opening balances
--   treasury_accounts          cash | bank | mobile_wallet | person_custody
--   treasury_categories        direction + counted_in_profit_by (orders/opex/none), subcategories
--   treasury_parties           delivery agents (one default), suppliers, employees, others
--   orders.delivery_agent_id   who holds the cash of a shipped order
--   treasury_carried_over_orders  shipped before go-live but still unpaid (ticked at go-live)
--   treasury_settlements (+ _orders)  an agent handing over cash for ticked orders
--   treasury_transactions      append-only, signed MRU amounts; transfers paired; reversals
--   treasury_audit_log         every write
--   views: treasury_account_balances, treasury_unsettled_orders, treasury_agent_holdings
--
-- Additive: nothing happens to orders until treasury_settings has a row.

-- === Shared: rows that can never change =====================================

create or replace function public.forbid_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only — record a reversing entry instead', tg_table_name
    using errcode = 'check_violation';
end;
$$;

-- === Go-live ================================================================

create table if not exists public.treasury_settings (
  country_id uuid primary key references public.countries(id),
  go_live_on date not null,
  go_live_at timestamptz not null default now(),
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_settings_local_only check (public.is_local_operations_country(country_id))
);

comment on table public.treasury_settings is
  'Treasury go-live per local-operations country, written once by treasury_go_live(). Orders shipped from go_live_at on are owed by the delivery agent until settled; earlier ones count as settled unless ticked into treasury_carried_over_orders.';

drop trigger if exists trg_treasury_settings_immutable on public.treasury_settings;
create trigger trg_treasury_settings_immutable
  before update or delete on public.treasury_settings
  for each row execute function public.forbid_update_delete();

-- === Accounts ===============================================================

create table if not exists public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('cash', 'bank', 'mobile_wallet', 'person_custody')),
  currency text not null default 'MRU' check (currency = 'MRU'),
  is_active boolean not null default true,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_accounts_local_only check (public.is_local_operations_country(country_id)),
  constraint treasury_accounts_name_key unique (country_id, name)
);

comment on table public.treasury_accounts is
  'Where money sits: cash box, bank, mobile wallet (Bankily, Masrvi, Sedad…) or an employee holding company money. Balance = sum of its transactions (see treasury_account_balances).';

-- === Categories =============================================================

create table if not exists public.treasury_categories (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  parent_id uuid references public.treasury_categories(id),
  name_ar text not null check (length(trim(name_ar)) > 0),
  -- income: amounts > 0; expense: amounts < 0; adjustment: either sign.
  direction text not null check (direction in ('income', 'expense', 'adjustment')),
  -- orders: already in the profit formula from orders (sales, delivery fees, ads)
  -- opex:   subtracted from profit as an operating expense
  -- none:   not profit (stock purchases, owner withdrawals, capital, transfers)
  counted_in_profit_by text not null check (counted_in_profit_by in ('orders', 'opex', 'none')),
  system_key text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_categories_local_only check (public.is_local_operations_country(country_id)),
  constraint treasury_categories_system_key_root check (system_key is null or parent_id is null)
);

create unique index if not exists treasury_categories_system_key
  on public.treasury_categories (country_id, system_key)
  where system_key is not null;
create unique index if not exists treasury_categories_name_key
  on public.treasury_categories (country_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name_ar);

-- A subcategory always behaves like its parent.
create or replace function public.treasury_categories_inherit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent record;
begin
  if new.parent_id is not null then
    select country_id, direction, counted_in_profit_by, parent_id into parent
      from public.treasury_categories where id = new.parent_id;
    if parent.country_id is distinct from new.country_id then
      raise exception 'subcategory must belong to its parent''s country' using errcode = 'check_violation';
    end if;
    if parent.parent_id is not null then
      raise exception 'only one level of subcategories' using errcode = 'check_violation';
    end if;
    new.direction := parent.direction;
    new.counted_in_profit_by := parent.counted_in_profit_by;
  end if;
  if tg_op = 'UPDATE' and old.system_key is not null and (
       new.system_key is distinct from old.system_key
       or new.direction is distinct from old.direction
       or new.counted_in_profit_by is distinct from old.counted_in_profit_by
       or new.parent_id is distinct from old.parent_id) then
    raise exception 'system categories keep their key, direction and profit treatment' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_treasury_categories_inherit on public.treasury_categories;
create trigger trg_treasury_categories_inherit
  before insert or update on public.treasury_categories
  for each row execute function public.treasury_categories_inherit();

-- Default categories for every local-operations country.
insert into public.treasury_categories (country_id, name_ar, direction, counted_in_profit_by, system_key)
select c.id, v.name_ar, v.direction, v.counted, v.system_key
  from public.countries c
 cross join (values
   ('المبيعات',              'income',     'orders', 'sales'),
   ('رسوم التوصيل',          'expense',    'orders', 'delivery_fees'),
   ('الإعلانات',             'expense',    'orders', 'ads'),
   ('مشتريات المخزون',       'expense',    'none',   'stock_purchases'),
   ('الرواتب',               'expense',    'opex',   'salaries'),
   ('الإيجار',               'expense',    'opex',   'rent'),
   ('مصاريف يومية',          'expense',    'opex',   'daily_expenses'),
   ('التغليف',               'expense',    'opex',   'packaging'),
   ('مسحوبات المالك',        'expense',    'none',   'owner_withdrawals'),
   ('رأس المال / تمويل',     'income',     'none',   'capital'),
   ('تحويل بين الحسابات',    'adjustment', 'none',   'transfer'),
   ('رصيد افتتاحي',          'adjustment', 'none',   'opening_balance'),
   ('فروقات الجرد النقدي',   'adjustment', 'opex',   'cash_difference'),
   ('فروقات التسوية',        'adjustment', 'opex',   'settlement_difference')
 ) as v(name_ar, direction, counted, system_key)
 where c.has_local_operations
on conflict do nothing;

-- === Parties ================================================================

create table if not exists public.treasury_parties (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('delivery_agent', 'supplier', 'employee', 'other')),
  phone text,
  is_default_delivery_agent boolean not null default false,
  is_active boolean not null default true,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_parties_local_only check (public.is_local_operations_country(country_id)),
  constraint treasury_parties_default_is_agent check (not is_default_delivery_agent or type = 'delivery_agent')
);

create unique index if not exists treasury_parties_one_default_agent
  on public.treasury_parties (country_id)
  where is_default_delivery_agent;

-- === Orders: who holds the cash =============================================

alter table public.orders
  add column if not exists delivery_agent_id uuid references public.treasury_parties(id);

comment on column public.orders.delivery_agent_id is
  'Delivery agent who delivers this order and owes its cash until settlement. Set to the default agent when the order ships (once the treasury is live); changeable until settled.';

create index if not exists orders_delivery_agent_id_idx
  on public.orders (delivery_agent_id)
  where delivery_agent_id is not null;

create table if not exists public.treasury_carried_over_orders (
  order_id uuid primary key references public.orders(id),
  country_id uuid not null references public.countries(id),
  created_at timestamptz not null default now()
);

comment on table public.treasury_carried_over_orders is
  'Orders shipped before the treasury go-live that the agent still had not paid for, ticked by the owner at go-live. Every other pre-go-live shipped order counts as already settled.';

-- === Settlements ============================================================

create table if not exists public.treasury_settlements (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  party_id uuid not null references public.treasury_parties(id),
  account_id uuid not null references public.treasury_accounts(id),
  settled_on date not null,
  collected numeric(14, 2) not null,
  fees numeric(14, 2) not null,
  agent_kept_fees boolean not null,
  expected_net numeric(14, 2) not null,
  -- Net cash that changed hands: negative when the owner paid the agent
  -- (e.g. a settlement of returned orders only, whose fees exceed collections).
  received numeric(14, 2) not null,
  difference numeric(14, 2) not null,
  reason text,
  note text,
  voided_at timestamptz,
  voided_reason text,
  voided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_settlements_local_only check (public.is_local_operations_country(country_id)),
  constraint treasury_settlements_difference check (difference = received - expected_net),
  constraint treasury_settlements_reason check (difference = 0 or length(trim(coalesce(reason, ''))) > 0),
  constraint treasury_settlements_void_reason check (voided_at is null or length(trim(coalesce(voided_reason, ''))) > 0)
);

create table if not exists public.treasury_settlement_orders (
  settlement_id uuid not null references public.treasury_settlements(id),
  order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('sale', 'return_fee')),
  collected numeric(14, 2) not null default 0,
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  voided boolean not null default false,
  primary key (settlement_id, order_id)
);

-- An order is settled at most once (a voided settlement frees it again).
create unique index if not exists treasury_settlement_orders_once
  on public.treasury_settlement_orders (order_id)
  where not voided;

-- === Transactions ===========================================================

create table if not exists public.treasury_transactions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  account_id uuid not null references public.treasury_accounts(id),
  amount numeric(14, 2) not null check (amount <> 0),
  category_id uuid not null references public.treasury_categories(id),
  party_id uuid references public.treasury_parties(id),
  occurred_on date not null,
  note text,
  receipt_path text,
  kind text not null default 'normal'
    check (kind in ('normal', 'opening', 'transfer', 'reversal', 'adjustment', 'settlement')),
  order_id uuid references public.orders(id),
  order_role text check (order_role is null or order_role in ('sale', 'delivery_fee')),
  stock_purchase_id uuid references public.stock_purchases(id),
  settlement_id uuid references public.treasury_settlements(id),
  transfer_group_id uuid,
  reverses_id uuid references public.treasury_transactions(id),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint treasury_transactions_local_only check (public.is_local_operations_country(country_id)),
  constraint treasury_transactions_order_role check ((order_id is null) = (order_role is null)),
  constraint treasury_transactions_reversal check ((kind = 'reversal') = (reverses_id is not null))
);

comment on table public.treasury_transactions is
  'Append-only money ledger (MRU). Positive = money in, negative = money out. Corrections are reversing rows (reverses_id); transfers are two rows sharing transfer_group_id.';

-- One reversal per transaction; one sale and one fee per order per settlement;
-- one expense per stock purchase.
create unique index if not exists treasury_transactions_reversed_once
  on public.treasury_transactions (reverses_id)
  where reverses_id is not null;
create unique index if not exists treasury_transactions_order_role_once
  on public.treasury_transactions (settlement_id, order_id, order_role)
  where reverses_id is null and order_id is not null;
create unique index if not exists treasury_transactions_stock_purchase_once
  on public.treasury_transactions (stock_purchase_id)
  where reverses_id is null and stock_purchase_id is not null;
create index if not exists treasury_transactions_account_date_idx
  on public.treasury_transactions (account_id, occurred_on);
create index if not exists treasury_transactions_country_date_idx
  on public.treasury_transactions (country_id, occurred_on);
create index if not exists treasury_transactions_party_idx
  on public.treasury_transactions (party_id)
  where party_id is not null;
create index if not exists treasury_transactions_order_idx
  on public.treasury_transactions (order_id)
  where order_id is not null;

drop trigger if exists trg_treasury_transactions_append_only on public.treasury_transactions;
create trigger trg_treasury_transactions_append_only
  before update or delete on public.treasury_transactions
  for each row execute function public.forbid_update_delete();

-- Sign follows the category; account, category and party share the row's country.
create or replace function public.treasury_transactions_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acc record;
  cat record;
begin
  select country_id, is_active into acc from public.treasury_accounts where id = new.account_id;
  select country_id, direction into cat from public.treasury_categories where id = new.category_id;
  if acc.country_id is distinct from new.country_id or cat.country_id is distinct from new.country_id then
    raise exception 'account and category must belong to the transaction''s country' using errcode = 'check_violation';
  end if;
  if new.party_id is not null and not exists (
       select 1 from public.treasury_parties where id = new.party_id and country_id = new.country_id) then
    raise exception 'party must belong to the transaction''s country' using errcode = 'check_violation';
  end if;
  if new.kind <> 'reversal' then
    if not acc.is_active then
      raise exception 'account is archived' using errcode = 'check_violation';
    end if;
    if cat.direction = 'income' and new.amount < 0 then
      raise exception 'income must be a positive amount' using errcode = 'check_violation';
    end if;
    if cat.direction = 'expense' and new.amount > 0 then
      raise exception 'expense must be a negative amount' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_treasury_transactions_check on public.treasury_transactions;
create trigger trg_treasury_transactions_check
  before insert on public.treasury_transactions
  for each row execute function public.treasury_transactions_check();

alter table public.stock_purchases
  drop constraint if exists stock_purchases_treasury_transaction_id_fkey;
alter table public.stock_purchases
  add constraint stock_purchases_treasury_transaction_id_fkey
  foreign key (treasury_transaction_id) references public.treasury_transactions(id);

-- === Audit log ==============================================================

create table if not exists public.treasury_audit_log (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists treasury_audit_log_country_created_idx
  on public.treasury_audit_log (country_id, created_at desc);

drop trigger if exists trg_treasury_audit_log_append_only on public.treasury_audit_log;
create trigger trg_treasury_audit_log_append_only
  before update or delete on public.treasury_audit_log
  for each row execute function public.forbid_update_delete();

create or replace function public.treasury_transactions_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.treasury_audit_log (country_id, action, entity, entity_id, details, actor)
  values (new.country_id, 'transaction.created', 'treasury_transactions', new.id,
          jsonb_build_object('kind', new.kind, 'amount', new.amount, 'account_id', new.account_id,
                             'category_id', new.category_id, 'order_id', new.order_id,
                             'settlement_id', new.settlement_id, 'reverses_id', new.reverses_id),
          new.created_by);
  return null;
end;
$$;

drop trigger if exists trg_treasury_transactions_audit on public.treasury_transactions;
create trigger trg_treasury_transactions_audit
  after insert on public.treasury_transactions
  for each row execute function public.treasury_transactions_audit();

-- === Orders → treasury hooks ================================================

-- Shipping assigns the default delivery agent (once the treasury is live).
create or replace function public.orders_assign_delivery_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'shipped'
     and old.status is distinct from 'shipped'
     and new.delivery_agent_id is null
     and exists (select 1 from public.treasury_settings s where s.country_id = new.country_id)
     and exists (select 1 from public.products p where p.id = new.product_id and p.fulfillment_type = 'owned') then
    select id into new.delivery_agent_id
      from public.treasury_parties
     where country_id = new.country_id and is_default_delivery_agent and is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_assign_delivery_agent on public.orders;
create trigger trg_orders_assign_delivery_agent
  before update of status on public.orders
  for each row execute function public.orders_assign_delivery_agent();

-- A settled order that comes back (shipped → internal_return): its sale is
-- reversed out of the account it was paid into. The delivery fee stays — the
-- agent did deliver it.
create or replace function public.orders_reverse_settled_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sale record;
begin
  if new.status = 'internal_return' and old.status = 'shipped' then
    for sale in
      select t.*
        from public.treasury_transactions t
       where t.order_id = new.id
         and t.order_role = 'sale'
         and t.reverses_id is null
         and not exists (select 1 from public.treasury_transactions r where r.reverses_id = t.id)
    loop
      insert into public.treasury_transactions
        (country_id, account_id, amount, category_id, party_id, occurred_on, note, kind,
         order_id, order_role, settlement_id, reverses_id)
      values (sale.country_id, sale.account_id, -sale.amount, sale.category_id, sale.party_id,
              (now() at time zone 'Africa/Nouakchott')::date,
              'مرتجع بعد التسوية', 'reversal', sale.order_id, sale.order_role, sale.settlement_id, sale.id);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_orders_reverse_settled_sale on public.orders;
create trigger trg_orders_reverse_settled_sale
  after update of status on public.orders
  for each row execute function public.orders_reverse_settled_sale();

-- === Views ==================================================================

create or replace view public.treasury_account_balances
with (security_invoker = true) as
select a.id as account_id, a.country_id, a.name, a.type, a.is_active,
       coalesce(sum(t.amount), 0)::numeric(14, 2) as balance,
       count(t.id)::integer as transactions
  from public.treasury_accounts a
  left join public.treasury_transactions t on t.account_id = a.id
 group by a.id;

-- Shipped orders the agent still owes cash for ('sale'), and returned orders
-- whose delivery fee is not settled yet ('return_fee').
create or replace view public.treasury_unsettled_orders
with (security_invoker = true) as
select o.id as order_id,
       o.country_id,
       o.delivery_agent_id,
       case when o.status = 'shipped' then 'sale' else 'return_fee' end as kind,
       o.total_price,
       o.delivery_cost,
       o.quantity,
       o.customer_name,
       o.phone,
       o.ordered_at,
       o.shipped_at,
       o.returned_at,
       p.name_ar as product_name,
       (co.order_id is not null) as carried_over
  from public.orders o
  join public.products p on p.id = o.product_id
  join public.treasury_settings s on s.country_id = o.country_id
  left join public.treasury_carried_over_orders co on co.order_id = o.id
 where o.deleted_at is null
   and p.fulfillment_type = 'owned'
   and (o.status = 'shipped' or (o.status = 'internal_return' and o.returned_at is not null))
   and (co.order_id is not null or (o.shipped_at is not null and o.shipped_at >= s.go_live_at))
   and not exists (
     select 1 from public.treasury_settlement_orders so
      where so.order_id = o.id and not so.voided
   );

create or replace view public.treasury_agent_holdings
with (security_invoker = true) as
select u.country_id,
       u.delivery_agent_id as party_id,
       count(*) filter (where u.kind = 'sale')::integer as unsettled_orders,
       coalesce(sum(u.total_price) filter (where u.kind = 'sale'), 0)::numeric(14, 2) as cash_held,
       count(*) filter (where u.kind = 'return_fee')::integer as returns_awaiting_fee
  from public.treasury_unsettled_orders u
 group by u.country_id, u.delivery_agent_id;

-- === RLS ====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['treasury_settings', 'treasury_accounts', 'treasury_categories', 'treasury_parties',
                           'treasury_carried_over_orders', 'treasury_settlements', 'treasury_transactions',
                           'treasury_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      || '(public.has_panel_permission(''view_treasury'') or public.has_panel_permission(''manage_treasury''))'
      || ' and public.is_local_operations_country(country_id))',
      t || '_select', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.treasury_settlement_orders enable row level security;
drop policy if exists treasury_settlement_orders_select on public.treasury_settlement_orders;
create policy treasury_settlement_orders_select on public.treasury_settlement_orders
  for select to authenticated
  using (
    (public.has_panel_permission('view_treasury') or public.has_panel_permission('manage_treasury'))
    and exists (select 1 from public.treasury_settlements s
                 where s.id = settlement_id and public.is_local_operations_country(s.country_id))
  );
revoke insert, update, delete on public.treasury_settlement_orders from anon, authenticated;
revoke all on public.treasury_settlement_orders from anon;
