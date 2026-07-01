-- Fix order soft-delete: the UPDATE policy in 037 required deleted_at IS NULL
-- in USING, and PostgreSQL defaults WITH CHECK to the same expression — so
-- setting deleted_at was rejected even though the pre-update row was visible.

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin"
  on public.orders for update
  using (
    deleted_at is null
    and (
      public.has_panel_permission('confirm_orders')
      or public.has_panel_permission('cancel_orders')
    )
  )
  with check (
    (
      public.has_panel_permission('confirm_orders')
      or public.has_panel_permission('cancel_orders')
    )
    and (
      deleted_at is null
      or public.has_panel_permission('cancel_orders')
    )
  );
