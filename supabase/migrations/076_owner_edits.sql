-- 076_owner_edits.sql
-- The owner (profiles.role = 'owner') can edit or soft-delete any treasury
-- transaction, stock movement and restock, and set a product's stock directly.
--
-- How it stays safe:
--   * The ledgers stay closed to everyone else. An UPDATE passes their guards
--     only inside owner_edit_begin(), which checks the user is an active owner
--     and switches a flag for the current transaction only.
--   * Nothing is hard-deleted: rows get deleted_at, and every balance, stock,
--     profit and reconciliation read ignores deleted rows (restorable).
--   * Every owner change is written to owner_edit_log by trigger (who, when,
--     old row, new row, optional reason), so no path can skip the log.
--   * Editing a stock movement created by an order marks the order
--     stock_manual: sync_order_stock() then leaves it alone until the owner
--     resets it (owner_reset_order_stock recomputes from the order).

-- === 1. Columns ==============================================================

alter table public.treasury_transactions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null;

alter table public.inventory_movements
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null,
  add column if not exists owner_edited boolean not null default false;

alter table public.stock_purchases
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null;

alter table public.stock_purchase_lines
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.orders
  add column if not exists stock_manual boolean not null default false;

comment on column public.orders.stock_manual is
  'True after the owner edited one of this order''s stock movements by hand: sync_order_stock() skips the order until owner_reset_order_stock() clears it.';

-- Owner-edited movements may carry any sign and need no reason.
alter table public.inventory_movements drop constraint if exists inventory_movements_sign;
alter table public.inventory_movements add constraint inventory_movements_sign check (
  is_correction
  or owner_edited
  or type = 'adjustment'
  or (type in ('opening', 'purchase', 'return_in') and quantity > 0)
  or (type in ('sale_out', 'damage') and quantity < 0)
);
alter table public.inventory_movements drop constraint if exists inventory_movements_manual_reason;
alter table public.inventory_movements add constraint inventory_movements_manual_reason check (
  owner_edited
  or order_id is not null
  or type not in ('adjustment', 'damage')
  or length(trim(coalesce(reason, ''))) > 0
);

-- "Exactly once" rules apply to live rows only: a deleted row never blocks.
drop index if exists public.inventory_movements_order_primary_key;
create unique index inventory_movements_order_primary_key
  on public.inventory_movements (order_id, product_id, type)
  where order_id is not null and not is_correction and deleted_at is null;
drop index if exists public.inventory_movements_opening_key;
create unique index inventory_movements_opening_key
  on public.inventory_movements (product_id)
  where type = 'opening' and deleted_at is null;
drop index if exists public.inventory_movements_purchase_line_key;
create unique index inventory_movements_purchase_line_key
  on public.inventory_movements (purchase_line_id)
  where purchase_line_id is not null and deleted_at is null;

drop index if exists public.treasury_transactions_reversed_once;
create unique index treasury_transactions_reversed_once
  on public.treasury_transactions (reverses_id)
  where reverses_id is not null and deleted_at is null;
drop index if exists public.treasury_transactions_order_role_once;
create unique index treasury_transactions_order_role_once
  on public.treasury_transactions (settlement_id, order_id, order_role)
  where reverses_id is null and order_id is not null and deleted_at is null;
drop index if exists public.treasury_transactions_stock_purchase_once;
create unique index treasury_transactions_stock_purchase_once
  on public.treasury_transactions (stock_purchase_id)
  where reverses_id is null and stock_purchase_id is not null and deleted_at is null;

-- === 2. Audit log ============================================================

create table if not exists public.owner_edit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  country_id uuid references public.countries(id),
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete', 'restore')),
  old_data jsonb,
  new_data jsonb,
  reason text
);

create index if not exists owner_edit_log_created_idx on public.owner_edit_log (created_at desc);
create index if not exists owner_edit_log_entity_idx on public.owner_edit_log (entity, entity_id);

drop trigger if exists trg_owner_edit_log_append_only on public.owner_edit_log;
create trigger trg_owner_edit_log_append_only
  before update or delete on public.owner_edit_log
  for each row execute function public.forbid_update_delete();

alter table public.owner_edit_log enable row level security;
-- Read through the service role after the app's owner check; no client access.
revoke all on public.owner_edit_log from anon, authenticated;

-- === 3. Owner session ========================================================

create or replace function public.is_owner_edit()
returns boolean
language sql
stable
as $$ select coalesce(current_setting('zeinz.owner_edit', true), '') = 'on' $$;

-- Opens an owner edit for the CURRENT transaction only (set_config local).
create or replace function public.owner_edit_begin(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or not exists (
       select 1 from public.profiles where id = p_user and role = 'owner' and is_active) then
    raise exception 'owner_only: only the owner can edit or delete records' using errcode = '42501';
  end if;
  perform set_config('zeinz.owner_edit', 'on', true);
  perform set_config('zeinz.actor', p_user::text, true);
  perform set_config('zeinz.reason', coalesce(trim(p_reason), ''), true);
end;
$$;

create or replace function public.log_owner_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
  v_action text;
  v_country uuid;
  v_id uuid := (to_jsonb(new) ->> 'id')::uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
    v_action := 'delete';
  elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
    v_action := 'restore';
  else
    v_action := 'update';
  end if;

  if tg_table_name = 'orders' then
    -- Only the stock flag is changed here; never copy customer data into the log.
    if v_old -> 'stock_manual' is not distinct from v_new -> 'stock_manual' then
      return null;
    end if;
    v_old := jsonb_build_object('stock_manual', v_old -> 'stock_manual');
    v_new := jsonb_build_object('stock_manual', v_new -> 'stock_manual');
  end if;

  v_country := (v_new ->> 'country_id')::uuid;
  if v_country is null and tg_table_name = 'stock_purchase_lines' then
    select country_id into v_country from public.stock_purchases where id = (v_new ->> 'purchase_id')::uuid;
  end if;

  insert into public.owner_edit_log (actor, country_id, entity, entity_id, action, old_data, new_data, reason)
  values (nullif(current_setting('zeinz.actor', true), '')::uuid, v_country, tg_table_name,
          v_id, v_action, v_old, v_new,
          nullif(current_setting('zeinz.reason', true), ''));
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['treasury_transactions', 'inventory_movements', 'stock_purchases', 'stock_purchase_lines', 'orders']
  loop
    execute format('drop trigger if exists trg_%s_owner_edit_log on public.%I', t, t);
    execute format(
      'create trigger trg_%s_owner_edit_log after insert or update on public.%I '
      || 'for each row when (public.is_owner_edit()) execute function public.log_owner_edit()', t, t);
  end loop;
end $$;

-- === 4. Guards: the ledgers open only inside an owner edit ===================

create or replace function public.forbid_update_delete()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'treasury_transactions' and public.is_owner_edit() then
    return new;
  end if;
  raise exception '% is append-only — record a reversing entry instead', tg_table_name
    using errcode = 'check_violation';
end;
$$;

create or replace function public.inventory_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and not public.is_owner_edit()) then
    raise exception 'inventory_movements is append-only — record a correcting movement instead'
      using errcode = 'check_violation';
  end if;
  select fulfillment_type, country_id into p from public.products where id = new.product_id;
  if p.fulfillment_type is distinct from 'owned' or p.country_id is distinct from new.country_id then
    raise exception 'stock is tracked only for owned products of the movement''s country (product %)', new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- === 5. Reads ignore deleted rows ============================================

create or replace view public.treasury_account_balances
with (security_invoker = true) as
select a.id as account_id, a.country_id, a.name, a.type, a.is_active,
       coalesce(sum(t.amount), 0)::numeric(14, 2) as balance,
       count(t.id)::integer as transactions
  from public.treasury_accounts a
  left join public.treasury_transactions t on t.account_id = a.id and t.deleted_at is null
 group by a.id;

create or replace view public.inventory_stock
with (security_invoker = true) as
select
  p.id as product_id,
  p.country_id,
  p.name_ar,
  p.deleted_at,
  p.cost_price,
  p.low_stock_threshold,
  coalesce(m.on_hand, 0)::integer as on_hand,
  coalesce(r.reserved, 0)::integer as reserved,
  (coalesce(m.on_hand, 0) - coalesce(r.reserved, 0))::integer as available
from public.products p
left join (
  select product_id, sum(quantity) as on_hand
    from public.inventory_movements
   where deleted_at is null
   group by product_id
) m on m.product_id = p.id
left join (
  select product_id, sum(quantity) as reserved
    from public.orders
   where status = 'confirmed' and deleted_at is null
   group by product_id
) r on r.product_id = p.id
where p.fulfillment_type = 'owned'
  and public.is_local_operations_country(p.country_id);

-- sync_order_stock: skips manually edited orders; ignores deleted movements.
create or replace function public.sync_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  golive timestamptz;
  target_sale integer := 0;
  target_return integer := 0;
  target_damage integer := 0;
begin
  select o2.id, o2.product_id, o2.country_id, o2.status, o2.quantity, o2.deleted_at,
         o2.shipped_at, o2.returned_at, o2.return_disposition, o2.unit_cost_price, o2.stock_manual,
         p.fulfillment_type
    into o
    from public.orders o2
    join public.products p on p.id = o2.product_id
   where o2.id = p_order_id
     for update of o2;
  if not found then
    return;
  end if;

  if o.fulfillment_type <> 'owned' or not public.is_local_operations_country(o.country_id) then
    return;
  end if;
  if o.stock_manual then
    return;
  end if;

  select s.go_live_at into golive from public.inventory_settings s where s.country_id = o.country_id;

  if golive is not null and o.deleted_at is null then
    if o.status in ('shipped', 'internal_return') and o.shipped_at is not null and o.shipped_at >= golive then
      target_sale := -o.quantity;
    end if;
    if o.status = 'internal_return' and o.returned_at is not null and o.returned_at >= golive then
      target_return := o.quantity;
      if o.return_disposition = 'damaged' then
        target_damage := -o.quantity;
      end if;
    end if;
  end if;

  insert into public.inventory_movements
    (country_id, product_id, quantity, type, order_id, unit_cost, reason, is_correction)
  select o.country_id,
         coalesce(t.product_id, e.product_id),
         coalesce(t.qty, 0) - coalesce(e.qty, 0),
         coalesce(t.type, e.type),
         o.id,
         o.unit_cost_price,
         case
           when e.product_id is null then format('order %s', o.status)
           else format('order changed: status=%s qty=%s%s', o.status, o.quantity,
                       case when o.deleted_at is not null then ' (deleted)' else '' end)
         end,
         e.product_id is not null
    from (values
            (o.product_id, 'sale_out'::text, target_sale),
            (o.product_id, 'return_in'::text, target_return),
            (o.product_id, 'damage'::text, target_damage)
         ) as t(product_id, type, qty)
    full outer join (
      select m.product_id, m.type, sum(m.quantity)::integer as qty
        from public.inventory_movements m
       where m.order_id = o.id and m.deleted_at is null
       group by m.product_id, m.type
    ) e on e.product_id = t.product_id and e.type = t.type
   where coalesce(t.qty, 0) - coalesce(e.qty, 0) <> 0;
end;
$$;

-- A return reverses only live sale entries.
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
         and t.deleted_at is null
         and not exists (select 1 from public.treasury_transactions r where r.reverses_id = t.id and r.deleted_at is null)
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

create or replace function public.treasury_reverse(p_transaction_id uuid, p_reason text, p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  orig record;
  leg record;
  v_count integer := 0;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select * into orig from public.treasury_transactions where id = p_transaction_id;
  if orig.id is null or orig.deleted_at is not null then
    raise exception 'unknown transaction' using errcode = 'no_data_found';
  end if;
  if orig.kind = 'reversal' then
    raise exception 'a reversal cannot be reversed' using errcode = 'check_violation';
  end if;
  if orig.settlement_id is not null then
    raise exception 'settlement entries are corrected by voiding the settlement' using errcode = 'check_violation';
  end if;
  if orig.stock_purchase_id is not null then
    raise exception 'stock purchase payments cannot be reversed here' using errcode = 'check_violation';
  end if;

  for leg in
    select * from public.treasury_transactions
     where deleted_at is null
       and ((orig.transfer_group_id is not null and transfer_group_id = orig.transfer_group_id)
            or (orig.transfer_group_id is null and id = orig.id))
  loop
    if exists (select 1 from public.treasury_transactions where reverses_id = leg.id and deleted_at is null) then
      raise exception 'already reversed' using errcode = 'unique_violation';
    end if;
    insert into public.treasury_transactions
      (country_id, account_id, amount, category_id, party_id, occurred_on, note, kind,
       order_id, order_role, transfer_group_id, reverses_id, created_by)
    values (leg.country_id, leg.account_id, -leg.amount, leg.category_id, leg.party_id, public.treasury_today(),
            trim(p_reason), 'reversal', leg.order_id, leg.order_role, leg.transfer_group_id, leg.id, p_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.treasury_void_settlement(p_settlement_id uuid, p_reason text, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  t record;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select * into s from public.treasury_settlements where id = p_settlement_id for update;
  if s.id is null then
    raise exception 'unknown settlement' using errcode = 'no_data_found';
  end if;
  if s.voided_at is not null then
    raise exception 'settlement already voided' using errcode = 'check_violation';
  end if;
  for t in
    select * from public.treasury_transactions tx
     where tx.settlement_id = p_settlement_id and tx.reverses_id is null and tx.deleted_at is null
       and not exists (select 1 from public.treasury_transactions r where r.reverses_id = tx.id and r.deleted_at is null)
  loop
    insert into public.treasury_transactions
      (country_id, account_id, amount, category_id, party_id, occurred_on, note, kind,
       order_id, order_role, settlement_id, reverses_id, created_by)
    values (t.country_id, t.account_id, -t.amount, t.category_id, t.party_id, public.treasury_today(),
            trim(p_reason), 'reversal', t.order_id, t.order_role, t.settlement_id, t.id, p_user);
  end loop;
  update public.treasury_settlement_orders set voided = true where settlement_id = p_settlement_id;
  update public.treasury_settlements
     set voided_at = now(), voided_reason = trim(p_reason), voided_by = p_user
   where id = p_settlement_id;
  perform public.treasury_audit(s.country_id, 'settlement.voided', 'treasury_settlements', p_settlement_id,
    jsonb_build_object('reason', p_reason), p_user);
end;
$$;

create or replace function public.treasury_cash_count(
  p_account_id uuid, p_counted numeric, p_reason text, p_user uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  acc record;
  v_balance numeric;
  v_diff numeric;
begin
  select * into acc from public.treasury_accounts where id = p_account_id for update;
  if acc.id is null then
    raise exception 'unknown account' using errcode = 'no_data_found';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'counted amount must be 0 or more' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_balance
    from public.treasury_transactions where account_id = p_account_id and deleted_at is null;
  v_diff := p_counted - v_balance;
  if v_diff <> 0 then
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'a reason is required for a difference' using errcode = '22023';
    end if;
    insert into public.treasury_transactions
      (country_id, account_id, amount, category_id, occurred_on, note, kind, created_by)
    values (acc.country_id, p_account_id, v_diff, public.treasury_category_id(acc.country_id, 'cash_difference'),
            public.treasury_today(), trim(p_reason), 'adjustment', p_user);
  end if;
  perform public.treasury_audit(acc.country_id, 'account.cash_count', 'treasury_accounts', p_account_id,
    jsonb_build_object('counted', p_counted, 'balance', v_balance, 'difference', v_diff), p_user);
  return v_diff;
end;
$$;

create or replace function public.treasury_record_stock_purchase(
  p_purchase_id uuid, p_account_id uuid, p_occurred_on date, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sp record;
  v_total numeric;
  v_id uuid;
begin
  select * into sp from public.stock_purchases where id = p_purchase_id for update;
  if sp.id is null or sp.deleted_at is not null then
    raise exception 'unknown stock purchase' using errcode = 'no_data_found';
  end if;
  perform public.treasury_require_live(sp.country_id);
  if sp.treasury_transaction_id is not null then
    raise exception 'this purchase is already paid from the treasury' using errcode = 'unique_violation';
  end if;
  select coalesce(sum(quantity * unit_cost), 0) + sp.extra_costs into v_total
    from public.stock_purchase_lines where purchase_id = p_purchase_id and deleted_at is null;
  if v_total <= 0 then
    raise exception 'purchase total is 0' using errcode = '22023';
  end if;
  insert into public.treasury_transactions
    (country_id, account_id, amount, category_id, occurred_on, note, kind, stock_purchase_id, created_by)
  values (sp.country_id, p_account_id, -v_total, public.treasury_category_id(sp.country_id, 'stock_purchases'),
          coalesce(p_occurred_on, sp.purchased_on), nullif(sp.supplier, ''), 'normal', p_purchase_id, p_user)
  returning id into v_id;
  update public.stock_purchases set treasury_transaction_id = v_id where id = p_purchase_id;
  return v_id;
end;
$$;

-- === 6. Owner functions: treasury ============================================

-- Signed amount for a category: the owner types the size, the category gives the sign.
create or replace function public.treasury_signed_amount(p_category_id uuid, p_amount numeric)
returns numeric
language sql
stable
set search_path = public
as $$
  select case c.direction
           when 'income' then abs(p_amount)
           when 'expense' then -abs(p_amount)
           else p_amount
         end
    from public.treasury_categories c where c.id = p_category_id
$$;

-- p_patch keys (all optional): amount, occurred_on, account_id, category_id,
-- party_id, note, receipt_path, kind, order_id, order_role. JSON null clears
-- a nullable field. Transfers: owner_update_transfer moves both sides.
create or replace function public.owner_update_transaction(
  p_id uuid, p_patch jsonb, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_category uuid;
  v_amount numeric;
  v_order uuid;
  v_role text;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into t from public.treasury_transactions where id = p_id for update;
  if t.id is null then
    raise exception 'unknown transaction' using errcode = 'no_data_found';
  end if;
  if t.deleted_at is not null then
    raise exception 'restore the transaction before editing it' using errcode = 'check_violation';
  end if;
  if t.transfer_group_id is not null and (p_patch ? 'amount' or p_patch ? 'account_id' or p_patch ? 'occurred_on') then
    raise exception 'edit a transfer as a whole (both sides move together)' using errcode = 'check_violation';
  end if;

  if p_patch ? 'account_id' and not exists (
       select 1 from public.treasury_accounts where id = (p_patch ->> 'account_id')::uuid and country_id = t.country_id) then
    raise exception 'account must belong to the transaction''s country' using errcode = 'check_violation';
  end if;
  v_category := coalesce((p_patch ->> 'category_id')::uuid, t.category_id);
  if not exists (select 1 from public.treasury_categories where id = v_category and country_id = t.country_id) then
    raise exception 'category must belong to the transaction''s country' using errcode = 'check_violation';
  end if;
  if p_patch ? 'party_id' and p_patch ->> 'party_id' is not null and not exists (
       select 1 from public.treasury_parties where id = (p_patch ->> 'party_id')::uuid and country_id = t.country_id) then
    raise exception 'party must belong to the transaction''s country' using errcode = 'check_violation';
  end if;

  v_amount := public.treasury_signed_amount(v_category, coalesce((p_patch ->> 'amount')::numeric, t.amount));
  if v_amount is null or v_amount = 0 then
    raise exception 'amount cannot be 0 — delete the transaction instead' using errcode = '22023';
  end if;

  v_order := case when p_patch ? 'order_id' then (p_patch ->> 'order_id')::uuid else t.order_id end;
  v_role := case
    when v_order is null then null
    when p_patch ? 'order_role' then coalesce(p_patch ->> 'order_role', 'sale')
    else coalesce(t.order_role, 'sale')
  end;

  update public.treasury_transactions
     set amount = v_amount,
         category_id = v_category,
         account_id = coalesce((p_patch ->> 'account_id')::uuid, account_id),
         party_id = case when p_patch ? 'party_id' then (p_patch ->> 'party_id')::uuid else party_id end,
         occurred_on = coalesce((p_patch ->> 'occurred_on')::date, occurred_on),
         note = case when p_patch ? 'note' then nullif(trim(p_patch ->> 'note'), '') else note end,
         receipt_path = case when p_patch ? 'receipt_path' then nullif(trim(p_patch ->> 'receipt_path'), '') else receipt_path end,
         kind = coalesce(p_patch ->> 'kind', kind),
         order_id = v_order,
         order_role = v_role,
         edited_at = now(),
         edited_by = p_user
   where id = p_id;
end;
$$;

create or replace function public.owner_update_transfer(
  p_group uuid, p_amount numeric, p_occurred_on date, p_from uuid, p_to uuid,
  p_note text, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country uuid;
  v_legs integer;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select min(country_id::text)::uuid, count(*) into v_country, v_legs
    from public.treasury_transactions
   where transfer_group_id = p_group and deleted_at is null and reverses_id is null;
  if v_legs <> 2 then
    raise exception 'unknown transfer' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'transfer amount must be positive' using errcode = '22023';
  end if;
  if p_from = p_to then
    raise exception 'choose two different accounts' using errcode = '22023';
  end if;
  if (select count(*) from public.treasury_accounts where id in (p_from, p_to) and country_id = v_country) <> 2 then
    raise exception 'accounts must belong to the transfer''s country' using errcode = 'check_violation';
  end if;
  update public.treasury_transactions
     set amount = case when amount < 0 then -p_amount else p_amount end,
         account_id = case when amount < 0 then p_from else p_to end,
         occurred_on = coalesce(p_occurred_on, occurred_on),
         note = nullif(trim(coalesce(p_note, '')), ''),
         edited_at = now(),
         edited_by = p_user
   where transfer_group_id = p_group and deleted_at is null and reverses_id is null;
end;
$$;

-- Deleting / restoring one side of a transfer acts on both sides.
create or replace function public.owner_set_transaction_deleted(
  p_id uuid, p_deleted boolean, p_user uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_count integer;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into t from public.treasury_transactions where id = p_id for update;
  if t.id is null then
    raise exception 'unknown transaction' using errcode = 'no_data_found';
  end if;
  update public.treasury_transactions
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end
   where (deleted_at is null) = p_deleted
     and ((t.transfer_group_id is not null and transfer_group_id = t.transfer_group_id
           and (reverses_id is null) = (t.reverses_id is null))
          or (t.transfer_group_id is null and id = t.id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- === 7. Owner functions: inventory ===========================================

-- p_patch keys (all optional): product_id, quantity, type, unit_cost, date
-- (YYYY-MM-DD, the movement's day), note.
create or replace function public.owner_update_movement(
  p_id uuid, p_patch jsonb, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_product uuid;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into m from public.inventory_movements where id = p_id for update;
  if m.id is null then
    raise exception 'unknown movement' using errcode = 'no_data_found';
  end if;
  if m.deleted_at is not null then
    raise exception 'restore the movement before editing it' using errcode = 'check_violation';
  end if;
  if p_patch ? 'quantity' and coalesce((p_patch ->> 'quantity')::integer, 0) = 0 then
    raise exception 'quantity cannot be 0 — delete the movement instead' using errcode = '22023';
  end if;
  v_product := coalesce((p_patch ->> 'product_id')::uuid, m.product_id);

  update public.inventory_movements
     set product_id = v_product,
         quantity = coalesce((p_patch ->> 'quantity')::integer, quantity),
         type = coalesce(p_patch ->> 'type', type),
         unit_cost = case when p_patch ? 'unit_cost' then (p_patch ->> 'unit_cost')::numeric else unit_cost end,
         created_at = case
           when p_patch ? 'date' then ((p_patch ->> 'date')::date + (created_at at time zone 'UTC')::time) at time zone 'UTC'
           else created_at end,
         reason = case when p_patch ? 'note' then nullif(trim(p_patch ->> 'note'), '') else reason end,
         owner_edited = true,
         edited_at = now(),
         edited_by = p_user
   where id = p_id;

  if m.order_id is not null then
    update public.orders set stock_manual = true where id = m.order_id and not stock_manual;
  end if;
end;
$$;

create or replace function public.owner_set_movement_deleted(
  p_id uuid, p_deleted boolean, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into m from public.inventory_movements where id = p_id for update;
  if m.id is null then
    raise exception 'unknown movement' using errcode = 'no_data_found';
  end if;
  update public.inventory_movements
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end,
         owner_edited = true
   where id = p_id and (deleted_at is null) = p_deleted;
  if m.order_id is not null then
    update public.orders set stock_manual = true where id = m.order_id and not stock_manual;
  end if;
end;
$$;

-- Types the real count; the difference is recorded as one adjustment.
create or replace function public.owner_set_stock(
  p_product_id uuid, p_quantity integer, p_user uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_on_hand integer;
  v_delta integer;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select id, country_id, cost_price into p from public.products
   where id = p_product_id and fulfillment_type = 'owned' for update;
  if p.id is null or not public.is_local_operations_country(p.country_id) then
    raise exception 'stock is tracked only for owned products of the local-operations market' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.inventory_settings where country_id = p.country_id) then
    raise exception 'inventory_not_live: enter the opening count first' using errcode = 'check_violation';
  end if;
  if p_quantity is null then
    raise exception 'enter the quantity' using errcode = '22023';
  end if;
  select coalesce(sum(quantity), 0)::integer into v_on_hand
    from public.inventory_movements where product_id = p_product_id and deleted_at is null;
  v_delta := p_quantity - v_on_hand;
  if v_delta <> 0 then
    insert into public.inventory_movements
      (country_id, product_id, quantity, type, unit_cost, reason, created_by)
    values (p.country_id, p_product_id, v_delta, 'adjustment', p.cost_price,
            coalesce(nullif(trim(p_reason), ''), 'ضبط المخزون مباشرة'), p_user);
  end if;
  return v_delta;
end;
$$;

-- Cancels the manual edit: the order's stock follows the order again.
create or replace function public.owner_reset_order_stock(p_order_id uuid, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_edit_begin(p_user, p_reason);
  update public.orders set stock_manual = false where id = p_order_id and stock_manual;
  perform public.sync_order_stock(p_order_id);
end;
$$;

-- Rewrites a restock: header, every line, their stock movements (landed cost
-- recomputed) and the linked treasury expense.
-- p_lines: [{ "id"?: existing line id, "product_id", "quantity", "unit_cost" }]
create or replace function public.owner_update_stock_purchase(
  p_purchase_id uuid, p_supplier text, p_purchased_on date, p_extra_costs numeric, p_note text,
  p_lines jsonb, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sp record;
  v_extra numeric := coalesce(p_extra_costs, 0);
  v_total_value numeric;
  v_total_qty numeric;
  line record;
  v_line uuid;
  v_landed numeric;
  v_keep uuid[];
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into sp from public.stock_purchases where id = p_purchase_id for update;
  if sp.id is null then
    raise exception 'unknown stock purchase' using errcode = 'no_data_found';
  end if;
  if sp.deleted_at is not null then
    raise exception 'restore the purchase before editing it' using errcode = 'check_violation';
  end if;
  if v_extra < 0 then
    raise exception 'extra costs cannot be negative' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a purchase needs at least one line' using errcode = '22023';
  end if;

  select sum((e ->> 'quantity')::numeric * (e ->> 'unit_cost')::numeric), sum((e ->> 'quantity')::numeric)
    into v_total_value, v_total_qty
    from jsonb_array_elements(p_lines) as e;

  update public.stock_purchases
     set supplier = coalesce(trim(p_supplier), ''),
         purchased_on = coalesce(p_purchased_on, purchased_on),
         extra_costs = v_extra,
         note = nullif(trim(coalesce(p_note, '')), ''),
         edited_at = now(),
         edited_by = p_user
   where id = p_purchase_id;

  v_keep := array(select (e ->> 'id')::uuid from jsonb_array_elements(p_lines) e where e ->> 'id' is not null);

  -- Lines left out of the new list: soft-deleted with their stock.
  update public.inventory_movements
     set deleted_at = now(), deleted_by = p_user, owner_edited = true
   where deleted_at is null
     and purchase_line_id in (
       select id from public.stock_purchase_lines
        where purchase_id = p_purchase_id and deleted_at is null and not (id = any (v_keep)));
  update public.stock_purchase_lines
     set deleted_at = now(), deleted_by = p_user
   where purchase_id = p_purchase_id and deleted_at is null and not (id = any (v_keep));

  for line in
    select (e ->> 'id')::uuid as id,
           (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity,
           (e ->> 'unit_cost')::numeric as unit_cost
      from jsonb_array_elements(p_lines) as e
  loop
    if line.quantity is null or line.quantity <= 0 then
      raise exception 'line quantity must be a whole number above 0' using errcode = '22023';
    end if;
    if line.unit_cost is null or line.unit_cost < 0 then
      raise exception 'line unit cost must be 0 or more' using errcode = '22023';
    end if;
    v_landed := round(line.unit_cost + case
      when v_extra = 0 then 0
      when v_total_value > 0 then v_extra * (line.quantity * line.unit_cost / v_total_value) / line.quantity
      else v_extra / v_total_qty
    end, 4);

    if line.id is not null then
      update public.stock_purchase_lines
         set product_id = line.product_id, quantity = line.quantity, unit_cost = line.unit_cost, landed_unit_cost = v_landed
       where id = line.id and purchase_id = p_purchase_id and deleted_at is null
      returning id into v_line;
      if v_line is null then
        raise exception 'line % is not part of this purchase', line.id using errcode = 'check_violation';
      end if;
      update public.inventory_movements
         set product_id = line.product_id, quantity = line.quantity, unit_cost = v_landed,
             reason = nullif(trim(coalesce(p_supplier, '')), ''),
             created_at = case when p_purchased_on is not null
               then (p_purchased_on + (created_at at time zone 'UTC')::time) at time zone 'UTC' else created_at end,
             owner_edited = true, edited_at = now(), edited_by = p_user
       where purchase_line_id = v_line and deleted_at is null;
      if not found then
        insert into public.inventory_movements
          (country_id, product_id, quantity, type, purchase_line_id, unit_cost, reason, created_by)
        values (sp.country_id, line.product_id, line.quantity, 'purchase', v_line, v_landed,
                nullif(trim(coalesce(p_supplier, '')), ''), p_user);
      end if;
    else
      insert into public.stock_purchase_lines (purchase_id, product_id, quantity, unit_cost, landed_unit_cost)
      values (p_purchase_id, line.product_id, line.quantity, line.unit_cost, v_landed)
      returning id into v_line;
      insert into public.inventory_movements
        (country_id, product_id, quantity, type, purchase_line_id, unit_cost, reason, created_by)
      values (sp.country_id, line.product_id, line.quantity, 'purchase', v_line, v_landed,
              nullif(trim(coalesce(p_supplier, '')), ''), p_user);
    end if;
    v_line := null;
  end loop;

  -- Its treasury expense follows the new total and date.
  update public.treasury_transactions
     set amount = -(coalesce(v_total_value, 0) + v_extra),
         occurred_on = coalesce(p_purchased_on, occurred_on),
         edited_at = now(), edited_by = p_user
   where id = sp.treasury_transaction_id and deleted_at is null
     and coalesce(v_total_value, 0) + v_extra > 0;
end;
$$;

create or replace function public.owner_set_stock_purchase_deleted(
  p_purchase_id uuid, p_deleted boolean, p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sp record;
begin
  perform public.owner_edit_begin(p_user, p_reason);
  select * into sp from public.stock_purchases where id = p_purchase_id for update;
  if sp.id is null then
    raise exception 'unknown stock purchase' using errcode = 'no_data_found';
  end if;
  if (sp.deleted_at is null) <> p_deleted then
    return;
  end if;
  -- Restore brings back exactly what the delete took (rows deleted at the same moment).
  update public.inventory_movements
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end,
         owner_edited = true
   where purchase_line_id in (select id from public.stock_purchase_lines where purchase_id = p_purchase_id
                                 and (case when p_deleted then deleted_at is null else deleted_at = sp.deleted_at end))
     and (case when p_deleted then deleted_at is null else deleted_at = sp.deleted_at end);
  update public.stock_purchase_lines
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end
   where purchase_id = p_purchase_id
     and (case when p_deleted then deleted_at is null else deleted_at = sp.deleted_at end);
  update public.treasury_transactions
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end
   where id = sp.treasury_transaction_id
     and (case when p_deleted then deleted_at is null else deleted_at = sp.deleted_at end);
  update public.stock_purchases
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then p_user else null end
   where id = p_purchase_id;
end;
$$;

-- === 8. Grants ================================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.owner_edit_begin(uuid, text)',
    'public.owner_update_transaction(uuid, jsonb, uuid, text)',
    'public.owner_update_transfer(uuid, numeric, date, uuid, uuid, text, uuid, text)',
    'public.owner_set_transaction_deleted(uuid, boolean, uuid, text)',
    'public.owner_update_movement(uuid, jsonb, uuid, text)',
    'public.owner_set_movement_deleted(uuid, boolean, uuid, text)',
    'public.owner_set_stock(uuid, integer, uuid, text)',
    'public.owner_reset_order_stock(uuid, uuid, text)',
    'public.owner_update_stock_purchase(uuid, text, date, numeric, text, jsonb, uuid, text)',
    'public.owner_set_stock_purchase_deleted(uuid, boolean, uuid, text)',
    'public.log_owner_edit()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
