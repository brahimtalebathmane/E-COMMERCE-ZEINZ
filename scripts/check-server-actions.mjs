/**
 * Next.js rule: a "use server" module may export ONLY async functions.
 * Type exports are erased and therefore fine; a runtime `export const`,
 * `export default` or non-async `export function` throws at module evaluation
 * and takes down every action in that file.
 *
 * tsc and eslint do not catch this — only `next build` does — so this runs as a
 * cheap pre-build check.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const files = globSync("src/**/*.{ts,tsx}");
const problems = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const head = source.trimStart().slice(0, 40);
  if (!head.startsWith('"use server"') && !head.startsWith("'use server'")) continue;

  const lines = source.split("\n");
  lines.forEach((line, i) => {
    if (!line.startsWith("export")) return;
    const legal =
      /^export\s+(type|interface)\b/.test(line) ||
      /^export\s+async\s+function\b/.test(line) ||
      /^export\s*\{/.test(line);
    if (!legal) {
      problems.push(`${file}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (problems.length > 0) {
  console.error('Illegal exports from a "use server" module (only async functions allowed):\n');
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`check-server-actions: ${files.length} files scanned, no illegal exports`);
