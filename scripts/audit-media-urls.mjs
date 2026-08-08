#!/usr/bin/env node
/**
 * Probes every media URL stored in the DB (products: main/secondary/
 * tertiary/gallery/testimonials/logo/CTA banner, plus
 * marketing_campaigns.image_url) and prints a status table. Video URLs
 * (Mux/HLS/Cloudflare Stream) are skipped — they're validated by playback,
 * not by fetching a content-type.
 *
 * Run before a deploy: npm run audit:media-urls
 * Exits non-zero if any URL fails, so it can gate a deploy pipeline.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const PROBE_TIMEOUT_MS = 6000;

// Kept in sync by hand with src/lib/video-media-url.ts — this script runs
// standalone (no TS build step), so it can't import that module directly.
// If you touch the regexes there, mirror the change here too.
function isVideoMediaUrl(url) {
  const u = (url ?? "").trim();
  if (!u) return false;
  const isHls = /\.m3u8($|\?)/i.test(u) || /stream\.mux\.com/i.test(u);
  const isMuxHosted = /(?:stream|player|watch)\.mux\.com/i.test(u);
  const hasMuxId =
    /stream\.mux\.com\/([a-zA-Z0-9]+)/i.test(u) ||
    /player\.mux\.com\/(?:embed\/)?([a-zA-Z0-9]+)/i.test(u) ||
    /watch\.mux\.com\/([a-zA-Z0-9]+)/i.test(u);
  let isCloudflareEmbed = false;
  try {
    const parsed = new URL(u);
    isCloudflareEmbed =
      parsed.hostname === "iframe.videodelivery.net" ||
      (/\.cloudflarestream\.com$/i.test(parsed.hostname) && /\/iframe\/?$/i.test(parsed.pathname));
  } catch {
    // not a valid URL — leave isCloudflareEmbed false, handled by the empty/invalid case below
  }
  const isCloudflareHls = /cloudflarestream\.com/i.test(u) && /\.m3u8($|\?)/i.test(u);
  return isHls || isMuxHosted || hasMuxId || isCloudflareEmbed || isCloudflareHls;
}

async function probe(url) {
  if (!url || !url.trim()) return { status: "SKIP", detail: "empty" };
  const trimmed = url.trim();
  if (isVideoMediaUrl(trimmed)) return { status: "SKIP", detail: "video URL" };

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { status: "FAIL", detail: "not a valid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { status: "FAIL", detail: `protocol is ${parsed.protocol}, not https:` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    if (!res.ok) return { status: "FAIL", detail: `HTTP ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().startsWith("image/")) {
      return { status: "FAIL", detail: `content-type "${ct || "(missing)"}"` };
    }
    return { status: "OK", detail: ct };
  } catch (error) {
    return { status: "FAIL", detail: `network error: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

function collectProductEntries(row) {
  const entries = [
    { field: "media_url", url: row.media_url },
    { field: "secondary_media_url", url: row.secondary_media_url },
    { field: "tertiary_media_url", url: row.tertiary_media_url },
    { field: "logo_url", url: row.logo_url },
    { field: "cta_banner_background_image_url", url: row.cta_banner_background_image_url },
  ];
  for (const [i, url] of (row.gallery ?? []).entries()) {
    entries.push({ field: `gallery[${i}]`, url });
  }
  for (const lang of ["testimonials_ar", "testimonials_fr"]) {
    for (const [i, t] of (row[lang] ?? []).entries()) {
      entries.push({ field: `${lang}[${i}].image`, url: t?.image });
    }
  }
  return entries;
}

async function main() {
  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select(
      "id, slug, media_url, secondary_media_url, tertiary_media_url, gallery, testimonials_ar, testimonials_fr, logo_url, cta_banner_background_image_url",
    )
    .is("deleted_at", null);
  if (productsErr) {
    console.error("Failed to load products:", productsErr.message);
    process.exit(1);
  }

  const { data: campaigns, error: campaignsErr } = await supabase
    .from("marketing_campaigns")
    .select("id, image_url");
  if (campaignsErr) {
    console.error("Failed to load marketing_campaigns:", campaignsErr.message);
    process.exit(1);
  }

  const rows = [];
  for (const product of products ?? []) {
    for (const entry of collectProductEntries(product)) {
      if (!entry.url || !entry.url.trim()) continue;
      rows.push({ slug: product.slug, field: entry.field, url: entry.url });
    }
  }
  for (const c of campaigns ?? []) {
    if (!c.image_url || !c.image_url.trim()) continue;
    rows.push({ slug: `campaign:${c.id.slice(0, 8)}…`, field: "image_url", url: c.image_url });
  }

  console.log(`Probing ${rows.length} media URL(s)...\n`);

  const results = [];
  let failCount = 0;
  let skipCount = 0;
  for (const row of rows) {
    const result = await probe(row.url);
    results.push({ ...row, ...result });
    if (result.status === "FAIL") failCount += 1;
    if (result.status === "SKIP") skipCount += 1;
  }

  const slugWidth = Math.max(8, ...results.map((r) => r.slug.length));
  const fieldWidth = Math.max(6, ...results.map((r) => r.field.length));
  console.log(
    `${"SLUG".padEnd(slugWidth)}  ${"FIELD".padEnd(fieldWidth)}  STATUS  DETAIL / URL`,
  );
  for (const r of results) {
    const statusLabel = r.status.padEnd(6);
    const detail = r.status === "OK" ? r.url : `${r.detail} — ${r.url}`;
    console.log(`${r.slug.padEnd(slugWidth)}  ${r.field.padEnd(fieldWidth)}  ${statusLabel}  ${detail}`);
  }

  console.log(
    `\n${results.length} checked, ${results.length - failCount - skipCount} OK, ${skipCount} skipped (video), ${failCount} failed.`,
  );

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
