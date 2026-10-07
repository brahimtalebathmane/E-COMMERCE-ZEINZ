-- 074_treasury_functions.sql
-- Phase C write paths. Service role only; the app checks manage_treasury and
-- the local-operations scope first. Every function writes treasury_audit_log
-- (transactions are also logged by trg_treasury_transactions_audit).

-- === Helpers ================================================================

create or replace function public.treasury_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Africa/Nouakchott')::date $$;

create or replace function public.treasury_category_id(p_country_id uuid, p_key text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.treasury_categories where country_id = p_country_id and system_key = p_key;
  if v_id is null then
    raise exception 'missing system category %', p_key using errcode = 'no_data_found';
  end if;
  return v_id;
end;
$$;

create or replace function public.treasury_require_live(p_country_id uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not exists (select 1 from public.treasury_settings where country_id = p_country_id) then
    raise exception 'treasury_not_live: set up the treasury first' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.treasury_audit(
  p_country_id uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb, p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.treasury_audit_log (country_id, action, entity, entity_id, details, actor)
  values (p_country_id, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb), p_user);
$$;

-- === Go-live ================================================================

-- p_accounts:     [{ "name", "type", "opening_balance" }]
-- p_carried_over: [order_id, …] shipped before go-live but still unpaid
create or replace function public.treasury_go_live(
  p_country_id uuid,
  p_go_live_on date,
  p_accounts jsonb,
  p_default_agent_name text,
  p_default_agent_phone text,
  p_carried_over jsonb,
  p_user uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
  acc record;
  v_account uuid;
  v_agent uuid;
  v_order uuid;
  v_opening_cat uuid;
begin
  if not public.is_local_operations_country(p_country_id) then
    raise exception 'treasury exists only for the local-operations market' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.treasury_settings where country_id = p_country_id) then
    raise exception 'treasury_already_live' using errcode = 'unique_violation';
  end if;
  if p_go_live_on is null or p_go_live_on > public.treasury_today() then
    raise exception 'go-live date must be today or earlier' using errcode = '22023';
  end if;
  if p_accounts is null or jsonb_array_length(p_accounts) = 0 then
    raise exception 'create at least one account' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_default_agent_name, ''))) = 0 then
    raise exception 'name the default delivery agent' using errcode = '22023';
  end if;

  insert into public.treasury_settings (country_id, go_live_on, go_live_at, set_by)
  values (p_country_id, p_go_live_on, v_at, p_user);

  v_opening_cat := public.treasury_category_id(p_country_id, 'opening_balance');
  for acc in
    select trim(e ->> 'name') as name, e ->> 'type' as type, coalesce((e ->> 'opening_balance')::numeric, 0) as opening
      from jsonb_array_elements(p_accounts) as e
  loop
    if acc.opening < 0 then
      raise exception 'opening balance of % cannot be negative', acc.name using errcode = '22023';
    end if;
    insert into public.treasury_accounts (country_id, name, type, created_by)
    values (p_country_id, acc.name, acc.type, p_user)
    returning id into v_account;
    if acc.opening > 0 then
      insert into public.treasury_transactions
        (country_id, account_id, amount, category_id, occurred_on, note, kind, created_by)
      values (p_country_id, v_account, acc.opening, v_opening_cat, p_go_live_on, 'رصيد افتتاحي', 'opening', p_user);
    end if;
  end loop;

  insert into public.treasury_parties (country_id, name, type, phone, is_default_delivery_agent, created_by)
  values (p_country_id, trim(p_default_agent_name), 'delivery_agent', nullif(trim(coalesce(p_default_agent_phone, '')), ''), true, p_user)
  returning id into v_agent;

  for v_order in
    select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(p_carried_over, '[]'::jsonb)) as e
  loop
    if not exists (
      select 1 from public.orders o join public.products p on p.id = o.product_id
       where o.id = v_order and o.country_id = p_country_id and o.status = 'shipped'
         and o.deleted_at is null and p.fulfillment_type = 'owned') then
      raise exception 'order % is not a shipped owned order of this country', v_order using errcode = 'check_violation';
    end if;
    insert into public.treasury_carried_over_orders (order_id, country_id) values (v_order, p_country_id);
    update public.orders set delivery_agent_id = coalesce(delivery_agent_id, v_agent) where id = v_order;
  end loop;

  perform public.treasury_audit(p_country_id, 'treasury.go_live', 'treasury_settings', null,
    jsonb_build_object('go_live_on', p_go_live_on, 'accounts', jsonb_array_length(p_accounts),
                       'carried_over', jsonb_array_length(coalesce(p_carried_over, '[]'::jsonb))), p_user);
  return v_at;
end;
$$;

-- === Accounts, categories, parties ==========================================

create or replace function public.treasury_create_account(
  p_country_id uuid, p_name text, p_type text, p_opening_balance numeric, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.treasury_require_live(p_country_id);
  if coalesce(p_opening_balance, 0) < 0 then
    raise exception 'opening balance cannot be negative' using errcode = '22023';
  end if;
  insert into public.treasury_accounts (country_id, name, type, created_by)
  values (p_country_id, trim(p_name), p_type, p_user)
  returning id into v_id;
  if coalesce(p_opening_balance, 0) > 0 then
    insert into public.treasury_transactions
      (country_id, account_id, amount, category_id, occurred_on, note, kind, created_by)
    values (p_country_id, v_id, p_opening_balance, public.treasury_category_id(p_country_id, 'opening_balance'),
            public.treasury_today(), 'رصيد افتتاحي', 'opening', p_user);
  end if;
  perform public.treasury_audit(p_country_id, 'account.created', 'treasury_accounts', v_id,
    jsonb_build_object('name', p_name, 'type', p_type, 'opening_balance', p_opening_balance), p_user);
  return v_id;
end;
$$;

create or replace function public.treasury_update_account(
  p_account_id uuid, p_name text, p_is_active boolean, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country uuid;
begin
  update public.treasury_accounts
     set name = coalesce(nullif(trim(p_name), ''), name),
         is_active = coalesce(p_is_active, is_active)
   where id = p_account_id
  returning country_id into v_country;
  if v_country is null then
    raise exception 'unknown account' using errcode = 'no_data_found';
  end if;
  perform public.treasury_audit(v_country, 'account.updated', 'treasury_accounts', p_account_id,
    jsonb_build_object('name', p_name, 'is_active', p_is_active), p_user);
end;
$$;

create or replace function public.treasury_create_category(
  p_country_id uuid, p_name text, p_parent_id uuid, p_direction text, p_counted text, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_parent_id is null and (p_direction is null or p_counted is null) then
    raise exception 'a top-level category needs a direction and a profit treatment' using errcode = '22023';
  end if;
  insert into public.treasury_categories (country_id, parent_id, name_ar, direction, counted_in_profit_by, created_by)
  values (p_country_id, p_parent_id, trim(p_name), coalesce(p_direction, 'expense'), coalesce(p_counted, 'opex'), p_user)
  returning id into v_id;
  perform public.treasury_audit(p_country_id, 'category.created', 'treasury_categories', v_id,
    jsonb_build_object('name', p_name, 'parent_id', p_parent_id, 'direction', p_direction, 'counted', p_counted), p_user);
  return v_id;
end;
$$;

create or replace function public.treasury_create_party(
  p_country_id uuid, p_name text, p_type text, p_phone text, p_make_default boolean, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(p_make_default, false) then
    update public.treasury_parties set is_default_delivery_agent = false
     where country_id = p_country_id and is_default_delivery_agent;
  end if;
  insert into public.treasury_parties (country_id, name, type, phone, is_default_delivery_agent, created_by)
  values (p_country_id, trim(p_name), p_type, nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_make_default, false), p_user)
  returning id into v_id;
  perform public.treasury_audit(p_country_id, 'party.created', 'treasury_parties', v_id,
    jsonb_build_object('name', p_name, 'type', p_type, 'default', p_make_default), p_user);
  return v_id;
end;
$$;

create or replace function public.treasury_set_default_agent(p_party_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country uuid;
begin
  select country_id into v_country from public.treasury_parties
   where id = p_party_id and type = 'delivery_agent' and is_active;
  if v_country is null then
    raise exception 'not an active delivery agent' using errcode = 'check_violation';
  end if;
  update public.treasury_parties set is_default_delivery_agent = false
   where country_id = v_country and is_default_delivery_agent and id <> p_party_id;
  update public.treasury_parties set is_default_delivery_agent = true where id = p_party_id;
  perform public.treasury_audit(v_country, 'party.default_agent', 'treasury_parties', p_party_id, '{}'::jsonb, p_user);
end;
$$;

-- Reassigns an unsettled shipped/returned order to another agent.
create or replace function public.treasury_assign_agent(p_order_id uuid, p_party_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country uuid;
begin
  select country_id into v_country from public.orders where id = p_order_id for update;
  if v_country is null then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.treasury_settlement_orders where order_id = p_order_id and not voided) then
    raise exception 'order_already_settled' using errcode = 'check_violation';
  end if;
  if p_party_id is not null and not exists (
       select 1 from public.treasury_parties where id = p_party_id and country_id = v_country and type = 'delivery_agent') then
    raise exception 'not a delivery agent of this country' using errcode = 'check_violation';
  end if;
  update public.orders set delivery_agent_id = p_party_id where id = p_order_id;
  perform public.treasury_audit(v_country, 'order.agent_assigned', 'orders', p_order_id,
    jsonb_build_object('party_id', p_party_id), p_user);
end;
$$;

-- === Transactions ===========================================================

-- Quick add. p_amount is the absolute value for income/expense categories
-- (the sign comes from the category) and signed for adjustment categories.
create or replace function public.treasury_add_transaction(
  p_country_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_party_id uuid,
  p_occurred_on date,
  p_note text,
  p_receipt_path text,
  p_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cat record;
  v_amount numeric;
  v_id uuid;
begin
  perform public.treasury_require_live(p_country_id);
  select direction, system_key into cat from public.treasury_categories where id = p_category_id and is_active;
  if cat.direction is null then
    raise exception 'unknown or archived category' using errcode = 'no_data_found';
  end if;
  if cat.system_key in ('transfer', 'opening_balance', 'cash_difference', 'settlement_difference') then
    raise exception 'use the dedicated screen for this category' using errcode = 'check_violation';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'amount cannot be 0' using errcode = '22023';
  end if;
  if p_occurred_on is null or p_occurred_on > public.treasury_today() then
    raise exception 'date cannot be in the future' using errcode = '22023';
  end if;
  v_amount := case cat.direction
    when 'income' then abs(p_amount)
    when 'expense' then -abs(p_amount)
    else p_amount
  end;
  insert into public.treasury_transactions
    (country_id, account_id, amount, category_id, party_id, occurred_on, note, receipt_path, kind, created_by)
  values (p_country_id, p_account_id, v_amount, p_category_id, p_party_id, p_occurred_on,
          nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_receipt_path, '')), ''), 'normal', p_user)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.treasury_transfer(
  p_country_id uuid, p_from uuid, p_to uuid, p_amount numeric, p_occurred_on date, p_note text, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_cat uuid;
begin
  perform public.treasury_require_live(p_country_id);
  if p_from = p_to then
    raise exception 'choose two different accounts' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'transfer amount must be positive' using errcode = '22023';
  end if;
  if p_occurred_on is null or p_occurred_on > public.treasury_today() then
    raise exception 'date cannot be in the future' using errcode = '22023';
  end if;
  v_cat := public.treasury_category_id(p_country_id, 'transfer');
  insert into public.treasury_transactions
    (country_id, account_id, amount, category_id, occurred_on, note, kind, transfer_group_id, created_by)
  values
    (p_country_id, p_from, -p_amount, v_cat, p_occurred_on, nullif(trim(coalesce(p_note, '')), ''), 'transfer', v_group, p_user),
    (p_country_id, p_to,    p_amount, v_cat, p_occurred_on, nullif(trim(coalesce(p_note, '')), ''), 'transfer', v_group, p_user);
  return v_group;
end;
$$;

-- Reverses one transaction (both legs of a transfer). Settlement rows are
-- reversed by voiding the settlement instead.
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
  if orig.id is null then
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
     where (orig.transfer_group_id is not null and transfer_group_id = orig.transfer_group_id)
        or (orig.transfer_group_id is null and id = orig.id)
  loop
    if exists (select 1 from public.treasury_transactions where reverses_id = leg.id) then
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

-- === Settlement with a delivery agent =======================================

-- p_sales:   [{ "order_id", "fee" }] shipped orders the agent is paying for
-- p_returns: [{ "order_id", "fee" }] returned orders whose fee he charges
-- A fee given here also fills/updates orders.delivery_cost (profit uses it).
create or replace function public.treasury_settle(
  p_country_id uuid,
  p_party_id uuid,
  p_account_id uuid,
  p_settled_on date,
  p_sales jsonb,
  p_returns jsonb,
  p_agent_keeps_fees boolean,
  p_received numeric,
  p_reason text,
  p_note text,
  p_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement uuid;
  line record;
  u record;
  v_collected numeric := 0;
  v_fees numeric := 0;
  v_expected numeric;
  v_sales_cat uuid;
  v_fee_cat uuid;
  v_fee numeric;
begin
  perform public.treasury_require_live(p_country_id);
  if not exists (select 1 from public.treasury_parties
                  where id = p_party_id and country_id = p_country_id and type = 'delivery_agent') then
    raise exception 'not a delivery agent of this country' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.treasury_accounts
                  where id = p_account_id and country_id = p_country_id and is_active) then
    raise exception 'unknown or archived account' using errcode = 'check_violation';
  end if;
  if p_settled_on is null or p_settled_on > public.treasury_today() then
    raise exception 'date cannot be in the future' using errcode = '22023';
  end if;
  if p_received is null then
    raise exception 'enter the amount received (negative if you paid the agent)' using errcode = '22023';
  end if;
  if coalesce(jsonb_array_length(p_sales), 0) + coalesce(jsonb_array_length(p_returns), 0) = 0 then
    raise exception 'tick at least one order' using errcode = '22023';
  end if;

  -- Lock every ticked order, validate it is unsettled and the agent's, and
  -- apply any fee typed on the screen.
  for line in
    select (e ->> 'order_id')::uuid as order_id, (e ->> 'fee')::numeric as fee, 'sale'::text as kind
      from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) as e
    union all
    select (e ->> 'order_id')::uuid, (e ->> 'fee')::numeric, 'return_fee'
      from jsonb_array_elements(coalesce(p_returns, '[]'::jsonb)) as e
  loop
    perform 1 from public.orders where id = line.order_id for update;
    select * into u from public.treasury_unsettled_orders
     where order_id = line.order_id and country_id = p_country_id;
    if u.order_id is null then
      raise exception 'order_not_unsettled: % is already settled or not owed', line.order_id using errcode = 'check_violation';
    end if;
    if u.kind <> line.kind then
      raise exception 'order % is a %, not a %', line.order_id, u.kind, line.kind using errcode = 'check_violation';
    end if;
    if u.delivery_agent_id is distinct from p_party_id then
      raise exception 'order % belongs to another agent', line.order_id using errcode = 'check_violation';
    end if;
    if line.fee is not null then
      if line.fee < 0 then
        raise exception 'fee cannot be negative' using errcode = '22023';
      end if;
      update public.orders set delivery_cost = round(line.fee, 2) where id = line.order_id;
    end if;
  end loop;

  select coalesce(sum(o.total_price) filter (where s.kind = 'sale'), 0),
         coalesce(sum(coalesce(o.delivery_cost, 0)), 0)
    into v_collected, v_fees
    from (
      select (e ->> 'order_id')::uuid as order_id, 'sale'::text as kind from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) e
      union all
      select (e ->> 'order_id')::uuid, 'return_fee' from jsonb_array_elements(coalesce(p_returns, '[]'::jsonb)) e
    ) s
    join public.orders o on o.id = s.order_id;

  v_expected := case when coalesce(p_agent_keeps_fees, true) then v_collected - v_fees else v_collected end;
  if p_received - v_expected <> 0 and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'explain the difference between received and expected' using errcode = '22023';
  end if;

  insert into public.treasury_settlements
    (country_id, party_id, account_id, settled_on, collected, fees, agent_kept_fees, expected_net,
     received, difference, reason, note, created_by)
  values (p_country_id, p_party_id, p_account_id, p_settled_on, v_collected, v_fees, coalesce(p_agent_keeps_fees, true),
          v_expected, p_received, p_received - v_expected, nullif(trim(coalesce(p_reason, '')), ''),
          nullif(trim(coalesce(p_note, '')), ''), p_user)
  returning id into v_settlement;

  v_sales_cat := public.treasury_category_id(p_country_id, 'sales');
  v_fee_cat := public.treasury_category_id(p_country_id, 'delivery_fees');

  for line in
    select o.id as order_id, s.kind, o.total_price, coalesce(o.delivery_cost, 0) as fee
      from (
        select (e ->> 'order_id')::uuid as order_id, 'sale'::text as kind from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) e
        union all
        select (e ->> 'order_id')::uuid, 'return_fee' from jsonb_array_elements(coalesce(p_returns, '[]'::jsonb)) e
      ) s
      join public.orders o on o.id = s.order_id
  loop
    insert into public.treasury_settlement_orders (settlement_id, order_id, kind, collected, fee)
    values (v_settlement, line.order_id, line.kind,
            case when line.kind = 'sale' then line.total_price else 0 end, line.fee);

    if line.kind = 'sale' and line.total_price > 0 then
      insert into public.treasury_transactions
        (country_id, account_id, amount, category_id, party_id, occurred_on, kind,
         order_id, order_role, settlement_id, created_by)
      values (p_country_id, p_account_id, line.total_price, v_sales_cat, p_party_id, p_settled_on, 'settlement',
              line.order_id, 'sale', v_settlement, p_user);
    end if;
    -- The agent's fee leaves the same account only when he kept it from the
    -- cash; otherwise it is paid separately (quick add, Delivery fees).
    if coalesce(p_agent_keeps_fees, true) and line.fee > 0 then
      insert into public.treasury_transactions
        (country_id, account_id, amount, category_id, party_id, occurred_on, kind,
         order_id, order_role, settlement_id, created_by)
      values (p_country_id, p_account_id, -line.fee, v_fee_cat, p_party_id, p_settled_on, 'settlement',
              line.order_id, 'delivery_fee', v_settlement, p_user);
    end if;
  end loop;

  if p_received - v_expected <> 0 then
    insert into public.treasury_transactions
      (country_id, account_id, amount, category_id, party_id, occurred_on, note, kind, settlement_id, created_by)
    values (p_country_id, p_account_id, p_received - v_expected,
            public.treasury_category_id(p_country_id, 'settlement_difference'), p_party_id, p_settled_on,
            trim(p_reason), 'adjustment', v_settlement, p_user);
  end if;

  perform public.treasury_audit(p_country_id, 'settlement.created', 'treasury_settlements', v_settlement,
    jsonb_build_object('party_id', p_party_id, 'collected', v_collected, 'fees', v_fees,
                       'expected', v_expected, 'received', p_received), p_user);
  return v_settlement;
end;
$$;

-- Undoes a settlement made by mistake: reverses its entries and frees its
-- orders to be settled again.
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
     where tx.settlement_id = p_settlement_id and tx.reverses_id is null
       and not exists (select 1 from public.treasury_transactions r where r.reverses_id = tx.id)
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

-- === Cash count =============================================================

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
  select coalesce(sum(amount), 0) into v_balance from public.treasury_transactions where account_id = p_account_id;
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

-- === Stock purchase payment (Phase B link) ==================================

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
  if sp.id is null then
    raise exception 'unknown stock purchase' using errcode = 'no_data_found';
  end if;
  perform public.treasury_require_live(sp.country_id);
  if sp.treasury_transaction_id is not null then
    raise exception 'this purchase is already paid from the treasury' using errcode = 'unique_violation';
  end if;
  select coalesce(sum(quantity * unit_cost), 0) + sp.extra_costs into v_total
    from public.stock_purchase_lines where purchase_id = p_purchase_id;
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

-- === Grants =================================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.treasury_go_live(uuid, date, jsonb, text, text, jsonb, uuid)',
    'public.treasury_create_account(uuid, text, text, numeric, uuid)',
    'public.treasury_update_account(uuid, text, boolean, uuid)',
    'public.treasury_create_category(uuid, text, uuid, text, text, uuid)',
    'public.treasury_create_party(uuid, text, text, text, boolean, uuid)',
    'public.treasury_set_default_agent(uuid, uuid)',
    'public.treasury_assign_agent(uuid, uuid, uuid)',
    'public.treasury_add_transaction(uuid, uuid, uuid, numeric, uuid, date, text, text, uuid)',
    'public.treasury_transfer(uuid, uuid, uuid, numeric, date, text, uuid)',
    'public.treasury_reverse(uuid, text, uuid)',
    'public.treasury_settle(uuid, uuid, uuid, date, jsonb, jsonb, boolean, numeric, text, text, uuid)',
    'public.treasury_void_settlement(uuid, text, uuid)',
    'public.treasury_cash_count(uuid, numeric, text, uuid)',
    'public.treasury_record_stock_purchase(uuid, uuid, date, uuid)',
    'public.treasury_audit(uuid, text, text, uuid, jsonb, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
