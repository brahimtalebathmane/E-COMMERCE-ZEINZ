-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (admin role)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  slug text not null unique,
  old_slugs text[] not null default '{}',
  price numeric(12, 2) not null,
  discount_price numeric(12, 2),
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null,
  features text[] not null default '{}',
  gallery text[] not null default '{}',
  testimonials jsonb not null default '[]',
  faqs jsonb not null default '[]',
  meta_pixel_id text,
  form_title text not null default '',
  form_fields jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists products_slug_idx on public.products (slug);
create index if not exists products_old_slugs_idx on public.products using gin (old_slugs);

alter table public.products enable row level security;

-- Public read for landing pages / ISR
create policy "products_select_public"
  on public.products for select
  using (true);

create policy "products_insert_admin"
  on public.products for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "products_update_admin"
  on public.products for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "products_delete_admin"
  on public.products for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  customer_name text,
  phone text,
  address text,
  payment_method text,
  payment_number text,
  transaction_reference text,
  receipt_image_url text,
  total_price numeric(12, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipped', 'cancelled')),
  form_data jsonb not null default '{}',
  completion_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists orders_product_id_idx on public.orders (product_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

-- Orders: only service role / backend — no policies for anon (use API routes with service role)
-- Admins read orders via authenticated client + policy:
create policy "orders_select_admin"
  on public.orders for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "orders_update_admin"
  on public.orders for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- No insert/delete from client — use service role in API routes

-- Payment methods (configurable)
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  account_number text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create policy "payment_methods_select_public"
  on public.payment_methods for select
  using (active = true);

create policy "payment_methods_select_admin"
  on public.payment_methods for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "payment_methods_insert_admin"
  on public.payment_methods for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "payment_methods_update_admin"
  on public.payment_methods for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "payment_methods_delete_admin"
  on public.payment_methods for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- New user signup: create profile (trigger) — admins created manually in Supabase or via signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket (create in dashboard or via SQL)
insert into storage.buckets (id, name, public)
values ('user-assets', 'user-assets', false)
on conflict (id) do nothing;

-- Storage policies: only service role uploads in practice; admin signed URLs via API
create policy "user_assets_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'user-assets'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
