// PGlite harness: a throwaway Postgres rebuilt from supabase/migrations, with
// minimal stand-ins for what Supabase provides (roles, auth, storage,
// realtime publication). Used by run-migration-checks.mjs scenarios.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");
const TRIPWIRE = "000_manual_migrations_only.sql";

export function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f !== TRIPWIRE)
    .sort();
}

export function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/**
 * New database with every migration applied whose file name sorts before
 * `before` (all of them when omitted). `beforeEach(file, db)` runs just before
 * a file is applied — scenarios use it to seed data at a given point in history.
 */
export async function freshDb({ before, beforeEach } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `);
  for (const file of migrationFiles()) {
    if (before && file >= before) break;
    if (beforeEach) await beforeEach(file, db);
    let sql = readMigration(file);
    // PGlite has no pgcrypto; gen_random_uuid() is built in since PG 13.
    if (file === "001_initial.sql") sql = sql.replace(/create extension[^;]*;/i, "");
    if (file === "058_revoke_definer_execute.sql") {
      // Created outside the repo on production; 058 revokes it.
      await db.exec(`create or replace function public.is_admin(uuid) returns boolean language sql as $$ select false $$;`);
    }
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${error.message}`);
    }
  }
  return db;
}

/** Inserts a product with the columns production requires; returns its id. */
export async function insertProduct(db, { slug, iso, fulfillment = "owned", currency, price = 100, costPrice = null }) {
  const cur = currency ?? (fulfillment === "owned" ? "MRU" : iso === "KW" ? "KWD" : "SAR");
  const res = await db.query(
    `insert into public.products
       (slug, name_ar, description_ar, features_ar, testimonials_ar, faqs_ar, price, media_type, media_url,
        country_id, fulfillment_type, currency, cost_price)
     values ($1, $1, 'd', '{}', '[]', '[]', $2, 'image', '',
       (select id from public.countries where iso_code = $3), $4, $5, $6)
     returning id`,
    [slug, price, iso, fulfillment, cur, costPrice],
  );
  return res.rows[0].id;
}

export async function ensureCountry(db, iso, currency, nameAr = iso) {
  await db.query(
    `insert into public.countries (name_ar, name_fr, iso_code, currency) values ($1, $1, $2, $3)
     on conflict (iso_code) do nothing`,
    [nameAr, iso, currency],
  );
}

/** Minimal scenario runner: records pass/fail per check. */
export function createReporter(name) {
  const results = [];
  const log = (line) => console.log(line);
  log(`\n### ${name}`);
  return {
    results,
    async ok(label, fn) {
      try {
        const value = await fn();
        results.push({ label, pass: true });
        log(`  ok    ${label}${value !== undefined ? `  ${JSON.stringify(value)}` : ""}`);
        return value;
      } catch (error) {
        results.push({ label, pass: false, error: error.message });
        log(`  FAIL  ${label}  -> ${error.message}`);
        return undefined;
      }
    },
    async fails(label, fn, match) {
      try {
        await fn();
        results.push({ label, pass: false, error: "expected an error" });
        log(`  FAIL  ${label}  -> expected an error, got none`);
      } catch (error) {
        if (match && !String(error.message).includes(match)) {
          results.push({ label, pass: false, error: error.message });
          log(`  FAIL  ${label}  -> wrong error: ${error.message}`);
          return;
        }
        results.push({ label, pass: true });
        log(`  ok    ${label}  (failed as expected: ${error.message.slice(0, 110)})`);
      }
    },
    equal(actual, expected, what = "value") {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
      return actual;
    },
  };
}

/** First column of the first row. */
export async function scalar(db, sql, params) {
  const res = await db.query(sql, params);
  const row = res.rows[0];
  return row ? Object.values(row)[0] : undefined;
}
