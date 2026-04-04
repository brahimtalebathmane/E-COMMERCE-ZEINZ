-- Bilingual product content: Arabic (default) + French manual translations.
-- Replaces single name/description/features/testimonials/faqs/form_* columns.

alter table public.products
  add column if not exists name_ar text,
  add column if not exists name_fr text not null default '',
  add column if not exists description_ar text,
  add column if not exists description_fr text not null default '',
  add column if not exists features_ar text[],
  add column if not exists features_fr text[] not null default '{}',
  add column if not exists testimonials_ar jsonb,
  add column if not exists testimonials_fr jsonb not null default '[]',
  add column if not exists faqs_ar jsonb,
  add column if not exists faqs_fr jsonb not null default '[]',
  add column if not exists form_title_ar text,
  add column if not exists form_title_fr text not null default '',
  add column if not exists form_fields_ar jsonb,
  add column if not exists form_fields_fr jsonb not null default '[]';

do $$
declare
  feat_udt text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'name'
  ) then
    select c.udt_name into feat_udt
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'products' and c.column_name = 'features';

    if feat_udt = '_text' then
      update public.products set
        name_ar = name,
        description_ar = description,
        features_ar = features,
        testimonials_ar = testimonials,
        faqs_ar = faqs,
        form_title_ar = form_title,
        form_fields_ar = form_fields
      where name_ar is null;
    elsif feat_udt = 'jsonb' then
      update public.products set
        name_ar = name,
        description_ar = description,
        features_ar = coalesce(
          array(
            select jsonb_array_elements_text(features::jsonb)
          ),
          '{}'::text[]
        ),
        testimonials_ar = testimonials,
        faqs_ar = faqs,
        form_title_ar = form_title,
        form_fields_ar = form_fields
      where name_ar is null;
    else
      update public.products set
        name_ar = name,
        description_ar = description,
        features_ar = '{}',
        testimonials_ar = testimonials,
        faqs_ar = faqs,
        form_title_ar = form_title,
        form_fields_ar = form_fields
      where name_ar is null;
    end if;
  end if;
end $$;

update public.products set name_ar = coalesce(name_ar, '');
update public.products set description_ar = coalesce(description_ar, '');
update public.products set features_ar = coalesce(features_ar, '{}');
update public.products set testimonials_ar = coalesce(testimonials_ar, '[]');
update public.products set faqs_ar = coalesce(faqs_ar, '[]');
update public.products set form_title_ar = coalesce(form_title_ar, '');
update public.products set form_fields_ar = coalesce(form_fields_ar, '[]');

alter table public.products
  alter column name_ar set not null,
  alter column description_ar set not null,
  alter column features_ar set not null,
  alter column testimonials_ar set not null,
  alter column faqs_ar set not null,
  alter column form_title_ar set not null,
  alter column form_fields_ar set not null;

alter table public.products drop column if exists name;
alter table public.products drop column if exists description;
alter table public.products drop column if exists features;
alter table public.products drop column if exists testimonials;
alter table public.products drop column if exists faqs;
alter table public.products drop column if exists form_title;
alter table public.products drop column if exists form_fields;
