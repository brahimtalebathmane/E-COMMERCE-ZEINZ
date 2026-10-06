-- 067_countries_local_operations.sql
-- Single source of truth for "this market has local operations": we hold the
-- stock and the cash there ourselves. Inventory and treasury exist ONLY for
-- such a country. Today that is Mauritania alone; Saudi Arabia and Kuwait are
-- affiliate-only markets where the COD Partner holds both.
--
-- App code reads this flag through hasLocalOperations()
-- (src/lib/local-operations.ts); SQL (RLS / check constraints in the
-- inventory and treasury migrations) reads it through
-- public.is_local_operations_country(). Nothing else may test
-- iso_code = 'MR' to decide whether a market has local operations.

alter table public.countries
  add column if not exists has_local_operations boolean not null default false;

comment on column public.countries.has_local_operations is
  'True only for the market where we hold stock and cash ourselves (Mauritania). Gates inventory and treasury. Not editable from the Countries screen; changing it requires a migration (see countries_local_operations_mr_only).';

-- The flag can only ever be on Mauritania. Turning local operations on for
-- another market must be a deliberate migration that changes this constraint,
-- never a toggle. iso_code is unique, so this also means "at most one".
alter table public.countries
  drop constraint if exists countries_local_operations_mr_only;
alter table public.countries
  add constraint countries_local_operations_mr_only
  check (not has_local_operations or iso_code = 'MR');

update public.countries
set has_local_operations = true
where iso_code = 'MR' and not has_local_operations;

do $$
declare
  flagged int;
begin
  select count(*) into flagged from public.countries where has_local_operations;
  if flagged <> 1 then
    raise exception 'Aborting: expected exactly one local-operations country (MR), found %', flagged;
  end if;
end $$;

-- The admin country scope reads countries_public (059), so the flag has to be
-- exposed there. create or replace view can only append columns, so it goes
-- last; the view keeps its grants and its 060 comment.
create or replace view public.countries_public as
select
  id,
  iso_code,
  name_ar,
  name_fr,
  currency,
  is_active,
  meta_pixel_id_public,
  created_at,
  has_local_operations
from public.countries
where is_active = true;

-- For RLS policies and check constraints on the inventory/treasury tables.
create or replace function public.is_local_operations_country(p_country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.has_local_operations from public.countries c where c.id = p_country_id),
    false
  );
$$;

revoke all on function public.is_local_operations_country(uuid) from public, anon;
grant execute on function public.is_local_operations_country(uuid) to authenticated, service_role;
