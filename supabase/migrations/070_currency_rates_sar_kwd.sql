-- 070_currency_rates_sar_kwd.sql
-- Exchange rates for the two affiliate markets, so their Meta ad spend (stored
-- in MRU) can be shown in each product's own currency on the profits page.
-- Values chosen by the owner on 2026-10-07, consistent with USD = 43 MRU:
--   SAR = 11.47 MRU (SAR is pegged at 3.75 per USD: 43 / 3.75)
--   KWD = 140 MRU   (about 3.26 USD per KWD)
-- Insert-only: never overwrites a rate. If either code already exists with a
-- different value, abort so the change is a deliberate decision.

do $$
declare
  conflicting int;
begin
  select count(*) into conflicting
  from public.currency_rates
  where (code = 'SAR' and mru_per_unit <> 11.47)
     or (code = 'KWD' and mru_per_unit <> 140);
  if conflicting > 0 then
    raise exception 'Aborting: SAR or KWD already has a different rate in currency_rates';
  end if;
end $$;

insert into public.currency_rates (code, mru_per_unit)
values
  ('SAR', 11.47),
  ('KWD', 140)
on conflict (code) do nothing;
