-- Remove legacy post-payment dynamic fields system (admin-defined).
-- New order flow collects only base order info at creation time.

alter table public.products
  drop column if exists form_title_ar,
  drop column if exists form_title_fr,
  drop column if exists form_fields_ar,
  drop column if exists form_fields_fr;

alter table public.orders
  drop column if exists form_data;

-- Allow admins to delete orders from the dashboard.
drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
  on public.orders for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

