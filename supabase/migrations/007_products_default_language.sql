-- Add a per-landing-page default language (storefront locale).
-- Landing pages should initialize to this language (users can still switch manually).

alter table public.products
  add column if not exists default_language text not null default 'ar';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_default_language_check'
  ) then
    alter table public.products
      add constraint products_default_language_check
      check (default_language in ('ar', 'fr'));
  end if;
end $$;

