-- Persist shopper session context at lead creation for server-side CAPI (Purchase / CancelledLead).
alter table public.orders
  add column if not exists meta_client_ip_address text,
  add column if not exists meta_client_user_agent text;
