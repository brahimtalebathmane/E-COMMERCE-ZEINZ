// supabase/checks/verify_migrations.sql against a database with every
// migration applied: everything must read "yes" except the documented cases.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReporter, freshDb } from "../harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.resolve(here, "../../../supabase/checks/verify_migrations.sql");

// Expected non-"yes" rows on a fresh PGlite database.
const EXPECTED = new Map([
  ["001_initial.sql", "PARTIAL"], // PGlite has no pgcrypto extension (production does)
  ["005_form_fields_required_backfill.sql", "n/a"],
  ["017_offer_section_fields.sql", "n/a"],
]);

export default async function run() {
  const r = createReporter("verify_migrations.sql on a fully migrated database");
  const db = await freshDb();
  const res = await db.query(fs.readFileSync(VERIFY, "utf8"));
  await r.ok("one row per migration file", async () => res.rows.length);
  for (const row of res.rows) {
    const expected = EXPECTED.get(row.file) ?? "yes";
    if (row.applied !== expected) {
      await r.ok(`${row.file}`, async () => {
        throw new Error(`applied=${row.applied}, expected ${expected}; missing: ${row.missing}`);
      });
    }
  }
  await r.ok("all other files read yes", async () => res.rows.filter((x) => x.applied === "yes").length);
  await db.close();
  return r.results;
}
