-- 000_manual_migrations_only.sql
-- TRIPWIRE — this file must never succeed.
--
-- Migrations in this repo are applied BY HAND in the Supabase SQL editor, one
-- file at a time (see supabase/MIGRATIONS_LOG.md). Production's CLI history
-- table (supabase_migrations.schema_migrations) records only some of them, so
-- `supabase db push` / `supabase migration up` would try to re-run old files —
-- including 015_lock_brand_identity.sql, whose UPDATE overwrites every
-- product's brand color and logo.
--
-- This file sorts first, so any CLI run stops here before any other file is
-- applied. Never paste it into the SQL editor, never mark it as applied with
-- `supabase migration repair`, and never delete it.

do $$
begin
  raise exception
    'Migrations in this repo are applied by hand — see supabase/MIGRATIONS_LOG.md. Do not use supabase db push / migration up / migration repair.';
end $$;
