// Runs every scenario in tests/pglite/scenarios against a PGlite database
// rebuilt from supabase/migrations. Exit code 1 if any check fails.
//   npm run test:migrations            all scenarios
//   npm run test:migrations -- phase-b only scenarios whose file name contains "phase-b"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "scenarios");
const filter = process.argv[2] ?? "";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs") && f.includes(filter)).sort();

let passed = 0;
let failed = 0;
for (const file of files) {
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  const results = await mod.default();
  for (const r of results) {
    if (r.pass) passed += 1;
    else failed += 1;
  }
}
console.log(`\nmigration checks: ${passed} passed, ${failed} failed (${files.length} scenario file(s))`);
process.exit(failed > 0 ? 1 : 0);
