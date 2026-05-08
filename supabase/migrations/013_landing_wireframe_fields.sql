-- Extra structured content fields for the redesigned landing wireframe.
alter table public.products
  add column if not exists hero_subtitle_ar text not null default '',
  add column if not exists hero_subtitle_fr text not null default '',
  add column if not exists stats_ar text[] not null default '{}',
  add column if not exists stats_fr text[] not null default '{}',
  add column if not exists contact_lines_ar text[] not null default '{}',
  add column if not exists contact_lines_fr text[] not null default '{}';
