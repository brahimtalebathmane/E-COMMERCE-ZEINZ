-- AI agent rules per product + WhatsApp conversation threads + human escalation status

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders add constraint orders_status_check
  check (status in (
    'pending',
    'confirmed',
    'shipped',
    'cancelled',
    'requires_human_intervention'
  ));

create table if not exists public.ai_agent_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  system_instruction text not null default '',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (product_id)
);

create index if not exists ai_agent_rules_product_id_idx
  on public.ai_agent_rules (product_id);

alter table public.ai_agent_rules enable row level security;

drop policy if exists "ai_agent_rules_select_admin" on public.ai_agent_rules;
drop policy if exists "ai_agent_rules_insert_admin" on public.ai_agent_rules;
drop policy if exists "ai_agent_rules_update_admin" on public.ai_agent_rules;
drop policy if exists "ai_agent_rules_delete_admin" on public.ai_agent_rules;

create policy "ai_agent_rules_select_admin"
  on public.ai_agent_rules for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "ai_agent_rules_insert_admin"
  on public.ai_agent_rules for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "ai_agent_rules_update_admin"
  on public.ai_agent_rules for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "ai_agent_rules_delete_admin"
  on public.ai_agent_rules for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create table if not exists public.whatsapp_chats (
  phone_number text primary key,
  openai_thread_id text not null,
  last_interaction timestamptz not null default now()
);

create index if not exists whatsapp_chats_last_interaction_idx
  on public.whatsapp_chats (last_interaction desc);

alter table public.whatsapp_chats enable row level security;

-- No client policies: service role only via API routes
