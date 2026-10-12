-- 075_orders_rls_initplan.sql
-- Speed only, no change in who can read or write what.
--
-- The orders policies called auth.uid() / has_panel_permission() as plain
-- expressions, so Postgres re-evaluated them for EVERY row (Supabase advisor
-- "auth_rls_initplan"). The admin orders list reads every order of a country
-- (~1,330 rows), so each read paid that cost per row. Wrapping each call in
-- (select …) makes it an init plan: evaluated once per query, same result.
--
-- The three policies are re-created with exactly the same commands, roles and
-- conditions; only the wrapping changes. Applied inside one transaction, so
-- there is no moment without policies.

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using ((select public.is_admin((select auth.uid()))))
  with check ((select public.is_admin((select auth.uid()))));

drop policy if exists orders_select_admin on public.orders;
create policy orders_select_admin on public.orders
  for select
  using (
    (select public.has_panel_permission('view_orders'))
    or (select public.has_panel_permission('view_analytics'))
    or (select public.has_panel_permission('view_meta_monitoring'))
  );

drop policy if exists orders_update_admin on public.orders;
create policy orders_update_admin on public.orders
  for update
  using (
    deleted_at is null
    and ((select public.has_panel_permission('confirm_orders')) or (select public.has_panel_permission('cancel_orders')))
  )
  with check (
    ((select public.has_panel_permission('confirm_orders')) or (select public.has_panel_permission('cancel_orders')))
    and (deleted_at is null or (select public.has_panel_permission('cancel_orders')))
  );
