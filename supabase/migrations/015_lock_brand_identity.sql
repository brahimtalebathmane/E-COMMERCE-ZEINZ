-- Lock brand identity values globally across products/landing pages.
update public.products
set
  brand_color = '#006B0C',
  logo_url = 'https://i.postimg.cc/pVjBKNCf/tsmym-bdwn-%CA%BFnwan-2026-05-08T170453-280.png';

create or replace function public.enforce_product_brand_identity()
returns trigger
language plpgsql
as $$
begin
  new.brand_color := '#006B0C';
  new.logo_url := 'https://i.postimg.cc/pVjBKNCf/tsmym-bdwn-%CA%BFnwan-2026-05-08T170453-280.png';
  return new;
end;
$$;

drop trigger if exists trg_products_enforce_brand_identity on public.products;
create trigger trg_products_enforce_brand_identity
before insert or update on public.products
for each row
execute function public.enforce_product_brand_identity();
