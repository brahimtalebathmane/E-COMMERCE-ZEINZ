-- Ensure testimonials JSON entries can consistently carry image, rating, and location metadata.
-- Safe: keeps existing values and only enriches object shape when fields are missing.
with normalized as (
  select
    id,
    coalesce(
      (
        select jsonb_agg(
          case
            when jsonb_typeof(item) = 'object' then
              jsonb_build_object(
                'name', coalesce(item->>'name', ''),
                'quote', coalesce(item->>'quote', ''),
                'role', nullif(item->>'role', ''),
                'image', nullif(item->>'image', ''),
                'rating',
                  case
                    when jsonb_typeof(item->'rating') = 'number' then item->'rating'
                    when (item->>'rating') ~ '^\d+(\.\d+)?$' then to_jsonb((item->>'rating')::numeric)
                    else to_jsonb(null::numeric)
                  end,
                'location', nullif(item->>'location', '')
              )
            else item
          end
        )
        from jsonb_array_elements(coalesce(testimonials_ar, '[]'::jsonb)) as item
      ),
      '[]'::jsonb
    ) as testimonials_ar_next,
    coalesce(
      (
        select jsonb_agg(
          case
            when jsonb_typeof(item) = 'object' then
              jsonb_build_object(
                'name', coalesce(item->>'name', ''),
                'quote', coalesce(item->>'quote', ''),
                'role', nullif(item->>'role', ''),
                'image', nullif(item->>'image', ''),
                'rating',
                  case
                    when jsonb_typeof(item->'rating') = 'number' then item->'rating'
                    when (item->>'rating') ~ '^\d+(\.\d+)?$' then to_jsonb((item->>'rating')::numeric)
                    else to_jsonb(null::numeric)
                  end,
                'location', nullif(item->>'location', '')
              )
            else item
          end
        )
        from jsonb_array_elements(coalesce(testimonials_fr, '[]'::jsonb)) as item
      ),
      '[]'::jsonb
    ) as testimonials_fr_next
  from public.products
)
update public.products p
set
  testimonials_ar = normalized.testimonials_ar_next,
  testimonials_fr = normalized.testimonials_fr_next
from normalized
where p.id = normalized.id;
