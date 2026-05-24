-- Align stored landing header logos with the canonical ZEINZ logo.
update public.products
set logo_url = '/icons/logo-zeina.png'
where logo_url in (
  'https://i.postimg.cc/W4kft1fx/logo-zeina.png',
  'https://i.postimg.cc/LXVG0mdk/ughujgijk.png',
  'https://i.postimg.cc/pVjBKNCf/tsmym-bdwn-%CA%BFnwan-2026-05-08T170453-280.png'
)
or logo_url like 'https://i.postimg.cc/%';
