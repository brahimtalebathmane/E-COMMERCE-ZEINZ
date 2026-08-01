-- 054_product_specs.sql
-- Adds an optional "Technical Specifications" landing section, same shape
-- as faqs_ar/faqs_fr (jsonb array of {label, value} pairs) with an
-- FR->AR fallback title, so the section stays fully data-driven and
-- absent for every existing product until an admin fills it in.

alter table public.products
  add column if not exists specs_title_ar text not null default '',
  add column if not exists specs_title_fr text not null default '',
  add column if not exists specs_ar jsonb not null default '[]',
  add column if not exists specs_fr jsonb not null default '[]';

comment on column public.products.specs_ar is
  'Technical specs shown as a label/value table on the landing page. Array of {"label": string, "value": string}. Empty = section hidden.';
comment on column public.products.specs_fr is
  'French counterpart of specs_ar, same shape. Falls back to specs_ar per item when empty.';
