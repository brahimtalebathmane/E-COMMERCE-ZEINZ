-- Order security: soft delete, duplicate-detection index, rate-limit buckets, RLS updates.

-- ---------------------------------------------------------------------------
-- Soft delete on orders (preserve audit trail; hide from admin UI via RLS)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists deleted_at timestamptz;

comment on column public.orders.deleted_at is
  'When set, order is hidden from admin UI but retained for auditing and compliance.';

create index if not exists orders_active_created_at_idx
  on public.orders (created_at desc)
  where deleted_at is null;

-- Speeds duplicate-order checks: same phone + product within a rolling window.
create index if not exists orders_phone_product_created_idx
  on public.orders (phone, product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Postgres-backed rate limiting (fallback when Upstash Redis is not configured)
-- ---------------------------------------------------------------------------
create table if not exists public.api_rate_limit_buckets (
  bucket_key text primary key,
  hit_count integer not null default 1,
  window_start timestamptz not null default now()
);

alter table public.api_rate_limit_buckets enable row level security;

comment on table public.api_rate_limit_buckets is
  'Sliding-window counters for public API rate limits. Service role only.';

create or replace function public.check_api_rate_limit(
  p_bucket_key text,
  p_max_hits integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limit_buckets%rowtype;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    return true;
  end if;

  select *
  into v_row
  from public.api_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.api_rate_limit_buckets (bucket_key, hit_count, window_start)
    values (p_bucket_key, 1, v_now);
    return true;
  end if;

  if v_now > v_row.window_start + make_interval(secs => p_window_seconds) then
    update public.api_rate_limit_buckets
    set hit_count = 1,
        window_start = v_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if v_row.hit_count >= p_max_hits then
    return false;
  end if;

  update public.api_rate_limit_buckets
  set hit_count = hit_count + 1
  where bucket_key = p_bucket_key;

  return true;
end;
$$;

revoke all on function public.check_api_rate_limit(text, integer, integer) from public;
grant execute on function public.check_api_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: hide soft-deleted orders from admin panel reads/updates
-- ---------------------------------------------------------------------------
drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select
  using (
    deleted_at is null
    and (
      public.has_panel_permission('view_orders')
      or public.has_panel_permission('view_analytics')
    )
  );

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin"
  on public.orders for update
  using (
    deleted_at is null
    and (
      public.has_panel_permission('confirm_orders')
      or public.has_panel_permission('cancel_orders')
    )
  );

-- Hard DELETE is no longer used; soft delete via UPDATE deleted_at.
drop policy if exists "orders_delete_admin" on public.orders;
