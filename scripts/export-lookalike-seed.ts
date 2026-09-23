/**
 * Exports Mauritanian buyers as a Meta Custom Audience customer list (seed for a Lookalike).
 * Read-only: writes nothing to the database and sends nothing to Meta — the CSVs are
 * uploaded by hand in Ads Manager. Output lands in ./exports/ (git-ignored: contains phones).
 *
 * Run: npm run export:lookalike-seed
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizePhoneForMetaE164 } from "@/lib/meta-user-data";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";

const TARGET_COUNTRY = "mr";
const EXPORT_DIR = join(process.cwd(), "exports");
const PAGE_SIZE = 1000;

type OrderRow = {
  id: string;
  phone: string | null;
  customer_name: string | null;
  total_price: number | string;
  currency: string | null;
  status: string;
  ordered_at: string | null;
  created_at: string;
  products: { countries: { iso_code: string; currency: string } | null } | null;
};

type Person = {
  phone: string;
  value: number;
  currency: string;
  /** Most recent non-empty name, and when that order was placed. */
  name: string;
  nameAt: string;
  firstAt: string;
  lastAt: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function fetchOrders(statuses: string[]): Promise<OrderRow[]> {
  const rows: OrderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, phone, customer_name, total_price, currency, status, ordered_at, created_at, products(countries(iso_code, currency))",
      )
      .is("deleted_at", null)
      .in("status", statuses)
      .not("phone", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`orders query failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as OrderRow[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Lowercase, strip punctuation/digits (keeps any script's letters, incl. Arabic), collapse spaces. */
function cleanName(raw: string | null): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Split on the first space; a single-word name leaves `ln` empty (never duplicated). */
function splitName(clean: string): { fn: string; ln: string } {
  const i = clean.indexOf(" ");
  return i === -1 ? { fn: clean, ln: "" } : { fn: clean.slice(0, i), ln: clean.slice(i + 1) };
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

async function exportSeed(fileName: string, statuses: string[]): Promise<number> {
  const orders = await fetchOrders(statuses);
  let otherCountry = 0;
  let unresolvedCountry = 0;
  let badPhone = 0;
  const people = new Map<string, Person>();

  for (const o of orders) {
    const country = o.products?.countries ?? null;
    if (!country?.iso_code) {
      unresolvedCountry++;
      continue;
    }
    if (country.iso_code.trim().toLowerCase() !== TARGET_COUNTRY) {
      otherCountry++;
      continue;
    }
    const phone = o.phone ? sanitizePhoneForMetaE164(o.phone) : null;
    if (!phone) {
      badPhone++;
      continue;
    }

    const money = metaPurchaseMoneyFromOrderTotal(
      Number(o.total_price) || 0,
      o.currency?.trim() || country.currency,
    );
    const at = o.ordered_at ?? o.created_at;
    const name = cleanName(o.customer_name);

    const p = people.get(phone);
    if (!p) {
      people.set(phone, {
        phone,
        value: money.value,
        currency: money.currency,
        name,
        nameAt: name ? at : "",
        firstAt: at,
        lastAt: at,
      });
      continue;
    }
    if (p.currency !== money.currency) {
      throw new Error(`Mixed currencies within one file (${p.currency} vs ${money.currency}); aborting.`);
    }
    p.value += money.value;
    if (at < p.firstAt) p.firstAt = at;
    if (at > p.lastAt) p.lastAt = at;
    if (name && at >= p.nameAt) {
      p.name = name;
      p.nameAt = at;
    }
  }

  const all = [...people.values()];
  const currencies = new Set(all.map((p) => p.currency));
  if (currencies.size > 1) {
    throw new Error(`Mixed currencies within one file (${[...currencies].join(", ")}); aborting.`);
  }
  // A buyer with no usable name is still matchable on phone alone: keep them, fn/ln empty.
  const kept = all.sort((a, b) => b.value - a.value);
  const emptyName = kept.filter((p) => !p.name).length;

  const lines = ["phone,fn,ln,country,value"];
  for (const p of kept) {
    const { fn, ln } = splitName(p.name);
    lines.push([p.phone, fn, ln, TARGET_COUNTRY, p.value.toFixed(2)].map(csvCell).join(","));
  }
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, fileName), "﻿" + lines.join("\r\n") + "\r\n", "utf8");

  const values = kept.map((p) => Math.round(p.value * 100) / 100).sort((a, b) => a - b);
  const firstAt = kept.reduce((m, p) => (!m || p.firstAt < m ? p.firstAt : m), "");
  const lastAt = kept.reduce((m, p) => (p.lastAt > m ? p.lastAt : m), "");
  const currency = [...currencies][0] ?? "n/a";

  console.log(`\n=== exports/${fileName}  (status in: ${statuses.join(", ")})`);
  console.log(`  orders fetched (all countries):   ${orders.length}`);
  console.log(`  orders outside ${TARGET_COUNTRY} (excluded):   ${otherCountry}`);
  console.log(`  rows written:                     ${kept.length}`);
  console.log(`  unique phone numbers:             ${new Set(kept.map((p) => p.phone)).size}`);
  console.log(`  dropped — bad phone (orders):     ${badPhone}`);
  console.log(`  dropped — unresolved country:     ${unresolvedCountry}`);
  console.log(`  kept with empty fn/ln (people):   ${emptyName}`);
  console.log(`  value currency:                   ${currency}`);
  console.log(
    `  value min / median / max:         ${(values[0] ?? 0).toFixed(2)} / ${median(values).toFixed(2)} / ${(values[values.length - 1] ?? 0).toFixed(2)}`,
  );
  console.log(`  order date range:                 ${firstAt.slice(0, 10) || "n/a"} → ${lastAt.slice(0, 10) || "n/a"}`);
  return kept.length;
}

async function main() {
  await exportSeed("lookalike-seed-shipped.csv", ["shipped"]);
  await exportSeed("lookalike-seed-all-buyers.csv", ["shipped", "internal_return"]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
