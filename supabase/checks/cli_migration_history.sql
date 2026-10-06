-- cli_migration_history.sql
-- READ-ONLY. Lists what the Supabase CLI believes is applied
-- (supabase_migrations.schema_migrations). `supabase db push` compares these
-- versions with the file-name prefixes in supabase/migrations/ and applies
-- every local file whose version is not listed here.
--
-- Output: one row per recorded migration — version, name, how many SQL
-- statements were recorded, and the first 120 characters of the first one
-- (enough to match it to a repo file when the name is empty).

-- Columns are read through to_jsonb because older CLI versions created this
-- table without `name` (and a direct reference would fail there).
select
  m.version,
  coalesce(to_jsonb(m) ->> 'name', '') as name,
  coalesce(jsonb_array_length(to_jsonb(m) -> 'statements'), 0) as statement_count,
  left(regexp_replace(coalesce(to_jsonb(m) -> 'statements' ->> 0, ''), '\s+', ' ', 'g'), 120)
    as first_statement
from supabase_migrations.schema_migrations m
order by m.version;
