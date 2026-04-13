alter table public.orders
  add column if not exists meta_event_id text,
  add column if not exists meta_event_source_url text,
  add column if not exists meta_pixel_id text,
  add column if not exists meta_lead_sent boolean not null default false,
  add column if not exists meta_purchase_sent boolean not null default false,
  add column if not exists meta_cancel_sent boolean not null default false;
