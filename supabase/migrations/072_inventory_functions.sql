-- 072_inventory_functions.sql
-- Phase B write paths. All are called by server code on the service role,
-- after the app has checked the user's permission and country scope.
--
--   change_order_status()        status change + history row, compare-and-set
--   inventory_go_live()          opening count + go-live, once per country
--   create_stock_purchase()      restock: purchase, lines, movements, landed cost
--   record_inventory_adjustment() manual adjustment / damage with a reason
--
-- Stock for orders is never written here directly: the status/quantity/delete
-- update fires trg_orders_sync_stock (071) inside the same transaction.

-- === Order status: one atomic step ==========================================

create or replace function public.change_order_status(
  p_order_id uuid,
  p_from text,
  p_to text,
  p_changed_by uuid default null,
  p_return_disposition text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_return_disposition is not null and p_return_disposition not in ('resellable', 'damaged') then
    raise exception 'invalid_return_disposition: %', p_return_disposition using errcode = '22023';
  end if;

  -- Compare-and-set: only succeeds if the order is still in p_from, so two
  -- concurrent changes (double click, bulk + single) can't both apply.
  update public.orders
     set status = p_to,
         return_disposition = case
           when p_to = 'internal_return' and status = 'shipped'
             then coalesce(p_return_disposition, 'resellable')
           else return_disposition
         end
   where id = p_order_id
     and status = p_from
     and deleted_at is null
  returning status into v_status;

  if v_status is null then
    if exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then
      raise exception 'status_conflict: order % is no longer %', p_order_id, p_from using errcode = '40001';
    end if;
    raise exception 'order_not_found: %', p_order_id using errcode = 'P0002';
  end if;

  insert into public.order_status_history (order_id, old_status, new_status, changed_by)
  values (p_order_id, p_from, p_to, p_changed_by);

  return v_status;
end;
$$;

comment on function public.change_order_status(uuid, text, text, uuid, text) is
  'The only way order status changes. Compare-and-set on the previous status, writes order_status_history, and (through trg_orders_sync_stock) the stock movement — all in one transaction. Meta events are sent by the app only after this succeeds.';

-- === Inventory go-live: opening count, once =================================

create or replace function public.inventory_go_live(
  p_country_id uuid,
  p_counts jsonb,
  p_user uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
  line record;
begin
  if not public.is_local_operations_country(p_country_id) then
    raise exception 'inventory exists only for the local-operations market' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.inventory_settings where country_id = p_country_id) then
    raise exception 'inventory_already_live' using errcode = 'unique_violation';
  end if;

  insert into public.inventory_settings (country_id, go_live_at, set_by)
  values (p_country_id, v_at, p_user);

  for line in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity
      from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) as e
  loop
    if line.quantity is null or line.quantity < 0 then
      raise exception 'invalid opening quantity for product %', line.product_id using errcode = '22023';
    end if;
    if line.quantity > 0 then
      insert into public.inventory_movements
        (country_id, product_id, quantity, type, unit_cost, reason, created_by, created_at)
      select p_country_id, line.product_id, line.quantity, 'opening', p.cost_price, 'opening count', p_user, v_at
        from public.products p
       where p.id = line.product_id;
      if not found then
        raise exception 'unknown product %', line.product_id using errcode = 'foreign_key_violation';
      end if;
    end if;
  end loop;

  return v_at;
end;
$$;

-- === Restock ================================================================

-- Extra costs (shipping, customs) are spread over the lines by value
-- (quantity × unit cost); by quantity when every line is free.
create or replace function public.create_stock_purchase(
  p_country_id uuid,
  p_supplier text,
  p_purchased_on date,
  p_extra_costs numeric,
  p_note text,
  p_lines jsonb,
  p_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase uuid;
  v_extra numeric := coalesce(p_extra_costs, 0);
  v_total_value numeric;
  v_total_qty numeric;
  line record;
  v_line uuid;
  v_landed numeric;
begin
  if not exists (select 1 from public.inventory_settings where country_id = p_country_id) then
    raise exception 'inventory_not_live: enter the opening count first' using errcode = 'check_violation';
  end if;
  if v_extra < 0 then
    raise exception 'extra costs cannot be negative' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a purchase needs at least one line' using errcode = '22023';
  end if;

  select sum((e ->> 'quantity')::numeric * (e ->> 'unit_cost')::numeric),
         sum((e ->> 'quantity')::numeric)
    into v_total_value, v_total_qty
    from jsonb_array_elements(p_lines) as e;

  insert into public.stock_purchases (country_id, supplier, purchased_on, extra_costs, note, created_by)
  values (p_country_id, coalesce(trim(p_supplier), ''), p_purchased_on, v_extra, nullif(trim(coalesce(p_note, '')), ''), p_user)
  returning id into v_purchase;

  for line in
    select (e ->> 'product_id')::uuid as product_id,
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

    v_landed := line.unit_cost + case
      when v_extra = 0 then 0
      when v_total_value > 0 then v_extra * (line.quantity * line.unit_cost / v_total_value) / line.quantity
      else v_extra / v_total_qty
    end;

    insert into public.stock_purchase_lines (purchase_id, product_id, quantity, unit_cost, landed_unit_cost)
    values (v_purchase, line.product_id, line.quantity, line.unit_cost, round(v_landed, 4))
    returning id into v_line;

    insert into public.inventory_movements
      (country_id, product_id, quantity, type, purchase_line_id, unit_cost, reason, created_by)
    values (p_country_id, line.product_id, line.quantity, 'purchase', v_line, round(v_landed, 4),
            nullif(trim(coalesce(p_supplier, '')), ''), p_user);
  end loop;

  return v_purchase;
end;
$$;

-- === Manual adjustment ======================================================

create or replace function public.record_inventory_adjustment(
  p_country_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_type text,
  p_reason text,
  p_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.inventory_settings where country_id = p_country_id) then
    raise exception 'inventory_not_live: enter the opening count first' using errcode = 'check_violation';
  end if;
  if p_type not in ('adjustment', 'damage') then
    raise exception 'adjustment type must be adjustment or damage' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'adjustment quantity cannot be 0' using errcode = '22023';
  end if;
  if p_type = 'damage' and p_quantity > 0 then
    raise exception 'damage removes stock: quantity must be negative' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  insert into public.inventory_movements
    (country_id, product_id, quantity, type, unit_cost, reason, created_by)
  select p_country_id, p_product_id, p_quantity, p_type, p.cost_price, trim(p_reason), p_user
    from public.products p
   where p.id = p_product_id
  returning id into v_id;

  if v_id is null then
    raise exception 'unknown product %', p_product_id using errcode = 'foreign_key_violation';
  end if;
  return v_id;
end;
$$;

-- === Grants =================================================================

revoke all on function public.change_order_status(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.inventory_go_live(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.create_stock_purchase(uuid, text, date, numeric, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.record_inventory_adjustment(uuid, uuid, integer, text, text, uuid) from public, anon, authenticated;

grant execute on function public.change_order_status(uuid, text, text, uuid, text) to service_role;
grant execute on function public.inventory_go_live(uuid, jsonb, uuid) to service_role;
grant execute on function public.create_stock_purchase(uuid, text, date, numeric, text, jsonb, uuid) to service_role;
grant execute on function public.record_inventory_adjustment(uuid, uuid, integer, text, text, uuid) to service_role;
