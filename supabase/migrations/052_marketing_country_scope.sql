-- 052_marketing_country_scope.sql
-- Scopes WhatsApp marketing campaigns to a single country, same as
-- products/orders/analytics. Without this, "all confirmed customers"
-- or a by-product audience could mix countries and broadcast a
-- Mauritania promo to Saudi customers (or vice versa) -- a real mistake,
-- not just a cosmetic one.

alter table public.marketing_campaigns
  add column if not exists country_id uuid references public.countries(id);

comment on column public.marketing_campaigns.country_id is
  'Market this campaign was created for (the admin''s selected country at creation time). Scopes the campaign list and its audience resolution.';

-- Backfill every existing campaign to Mauritania (the only market that
-- existed before multi-country support), then lock the column down.
update public.marketing_campaigns
set country_id = (select id from public.countries where iso_code = 'MR')
where country_id is null;

do $$
declare
  missing_count int;
begin
  select count(*) into missing_count from public.marketing_campaigns where country_id is null;
  if missing_count > 0 then
    raise exception 'Aborting: % marketing_campaigns row(s) have no country_id after backfill', missing_count;
  end if;
end $$;

alter table public.marketing_campaigns
  alter column country_id set not null;

create index if not exists marketing_campaigns_country_id_idx
  on public.marketing_campaigns (country_id);

-- Extend the audience RPC with an optional country filter (joins to
-- products.country_id via the order's product_id). Left join so an order
-- somehow missing its product row is never silently dropped when no
-- country filter is applied.
--
-- The new signature has a different parameter list than the original
-- (uuid) overload, so `create or replace` would add a second, ambiguous
-- overload instead of replacing it -- drop the old one first.
drop function if exists public.marketing_audience_confirmed(uuid);

create or replace function public.marketing_audience_confirmed(
  p_product_id uuid default null,
  p_country_id uuid default null
)
returns table (phone text, customer_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.phone) o.phone, o.customer_name
  from public.orders o
  left join public.products pr on pr.id = o.product_id
  where o.deleted_at is null
    and o.phone is not null
    and (p_product_id is null or o.product_id = p_product_id)
    and (p_country_id is null or pr.country_id = p_country_id)
    and (
      o.status = 'confirmed'
      or exists (
        select 1 from public.order_status_history h
        where h.order_id = o.id and h.new_status = 'confirmed'
      )
    )
  order by o.phone, o.created_at desc;
$$;

revoke all on function public.marketing_audience_confirmed(uuid, uuid) from public;
grant execute on function public.marketing_audience_confirmed(uuid, uuid) to authenticated, service_role;
