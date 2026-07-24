-- 049_marketing_shipped_exclusion.sql
-- Lets an admin exclude customers who were already shipped one or more
-- specific products from a marketing campaign's audience — avoids pricing
-- conflicts (e.g. sending a discount to someone who already paid full price
-- for that product). Applies after the base audience/segment selection,
-- across all three audience modes (all_confirmed, by_product, manual).

alter table public.marketing_campaigns
  add column if not exists exclude_shipped_product_ids uuid[] not null default '{}';

comment on column public.marketing_campaigns.exclude_shipped_product_ids is
  'Product ids to exclude shipped customers of, applied after the base audience selection. Empty array = no exclusion. Stored on the campaign so send-time re-resolution (automatic audience modes) uses the same filter chosen at creation.';

-- Distinct phones with a shipped order (current status, OR ever reached
-- shipped per order_status_history — a shipped order later marked
-- internal_return still means the customer received the product, which is
-- exactly the pricing-conflict scenario this filter exists to avoid) for
-- any of the given products. Mirrors marketing_audience_confirmed's
-- current-or-historical pattern, applied to 'shipped' instead of 'confirmed'.
create or replace function public.marketing_shipped_phones(p_product_ids uuid[])
returns table (phone text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct o.phone
  from public.orders o
  where o.deleted_at is null
    and o.phone is not null
    and o.product_id = any(p_product_ids)
    and (
      o.status = 'shipped'
      or exists (
        select 1 from public.order_status_history h
        where h.order_id = o.id and h.new_status = 'shipped'
      )
    );
$$;

revoke all on function public.marketing_shipped_phones(uuid[]) from public;
grant execute on function public.marketing_shipped_phones(uuid[]) to authenticated, service_role;
