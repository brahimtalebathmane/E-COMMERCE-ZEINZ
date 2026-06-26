-- RBAC: owner/staff roles with granular JSON permissions on profiles.

alter table public.profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists display_name text;

-- Legacy `admin` rows become `owner` (full access).
update public.profiles set role = 'owner' where role = 'admin';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'staff'));

create or replace function public.is_owner_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role = 'owner'
  );
$$;

create or replace function public.is_active_panel_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('owner', 'staff')
  );
$$;

create or replace function public.has_panel_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'owner'
        or (
          p.role = 'staff'
          and p.permissions @> jsonb_build_array(perm)
        )
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text := coalesce(new.raw_user_meta_data->>'role', '');
  meta_permissions jsonb := coalesce(new.raw_user_meta_data->'permissions', '[]'::jsonb);
  meta_display_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
begin
  insert into public.profiles (id, email, role, permissions, display_name)
  values (
    new.id,
    new.email,
    case when meta_role = 'staff' then 'staff' else 'owner' end,
    case when meta_role = 'staff' then meta_permissions else '[]'::jsonb end,
    meta_display_name
  );
  return new;
end;
$$;

-- Owner may list staff profiles for the management panel.
drop policy if exists "profiles_select_owner" on public.profiles;
create policy "profiles_select_owner"
  on public.profiles for select
  using (public.is_owner_user());

-- Products
drop policy if exists "products_insert_admin" on public.products;
create policy "products_insert_admin"
  on public.products for insert
  with check (public.has_panel_permission('manage_products'));

drop policy if exists "products_update_admin" on public.products;
create policy "products_update_admin"
  on public.products for update
  using (public.has_panel_permission('manage_products'));

drop policy if exists "products_delete_admin" on public.products;
create policy "products_delete_admin"
  on public.products for delete
  using (public.has_panel_permission('manage_products'));

-- Orders
drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select
  using (
    public.has_panel_permission('view_orders')
    or public.has_panel_permission('view_analytics')
  );

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin"
  on public.orders for update
  using (
    public.has_panel_permission('confirm_orders')
    or public.has_panel_permission('cancel_orders')
  );

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
  on public.orders for delete
  using (public.has_panel_permission('cancel_orders'));

-- Payment methods (owner-only operational config)
drop policy if exists "payment_methods_select_admin" on public.payment_methods;
create policy "payment_methods_select_admin"
  on public.payment_methods for select
  using (public.is_owner_user());

drop policy if exists "payment_methods_insert_admin" on public.payment_methods;
create policy "payment_methods_insert_admin"
  on public.payment_methods for insert
  with check (public.is_owner_user());

drop policy if exists "payment_methods_update_admin" on public.payment_methods;
create policy "payment_methods_update_admin"
  on public.payment_methods for update
  using (public.is_owner_user());

drop policy if exists "payment_methods_delete_admin" on public.payment_methods;
create policy "payment_methods_delete_admin"
  on public.payment_methods for delete
  using (public.is_owner_user());

-- Ad spend / profit analytics
drop policy if exists "product_ad_spend_select_admin" on public.product_ad_spend;
create policy "product_ad_spend_select_admin"
  on public.product_ad_spend for select
  using (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_spend_insert_admin" on public.product_ad_spend;
create policy "product_ad_spend_insert_admin"
  on public.product_ad_spend for insert
  with check (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_spend_update_admin" on public.product_ad_spend;
create policy "product_ad_spend_update_admin"
  on public.product_ad_spend for update
  using (public.has_panel_permission('view_analytics'));

drop policy if exists "product_ad_spend_delete_admin" on public.product_ad_spend;
create policy "product_ad_spend_delete_admin"
  on public.product_ad_spend for delete
  using (public.has_panel_permission('view_analytics'));

-- Storage reads for product media management
drop policy if exists "user_assets_admin_read" on storage.objects;
create policy "user_assets_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'user-assets'
    and public.has_panel_permission('manage_products')
  );
