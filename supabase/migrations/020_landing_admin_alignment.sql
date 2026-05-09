-- Per-product accent color (admin-controlled); optional section titles / footer line on landing.
create or replace function public.enforce_product_brand_identity()
returns trigger
language plpgsql
as $$
begin
  if new.brand_color is null or length(trim(new.brand_color::text)) = 0 then
    new.brand_color := '#006B0C';
  end if;
  return new;
end;
$$;

alter table public.products
  add column if not exists stats_section_title_ar text not null default '',
  add column if not exists stats_section_title_fr text not null default '',
  add column if not exists testimonials_badge_ar text not null default '',
  add column if not exists testimonials_badge_fr text not null default '',
  add column if not exists footer_note_ar text not null default '',
  add column if not exists footer_note_fr text not null default '';

comment on column public.products.stats_section_title_ar is 'Stats band section heading (Arabic). Empty uses template default on landing.';
comment on column public.products.testimonials_badge_ar is 'Small pill under testimonials title (Arabic).';
