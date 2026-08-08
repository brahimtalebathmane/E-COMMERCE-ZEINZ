#!/usr/bin/env node
/**
 * One-off: rewrites already-stored `user-assets` 5-year SIGNED URLs (see
 * migration 001_initial.sql) to `public-assets` PUBLIC URLs (see migration
 * 056_public_assets_bucket.sql), across products (media/gallery/
 * testimonials/logo/CTA banner) and marketing_campaigns.image_url.
 *
 * The underlying object is copied — not moved — from user-assets to
 * public-assets at the same bucket-relative path, then the DB URL is
 * rewritten to the new public URL. Nothing is deleted from user-assets.
 *
 * Safe by default: without --apply this only PRINTS what it would do
 * (every row/field it would touch, old URL -> new URL) and makes no
 * network writes. Pass --apply to actually copy the storage objects and
 * update the DB rows.
 *
 * Run: node scripts/migrate-user-assets-to-public.mjs [--apply]
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
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SOURCE_BUCKET = "user-assets";
const DEST_BUCKET = "public-assets";

// Matches https://<project>.supabase.co/storage/v1/object/sign/user-assets/<path>?token=...
const SIGNED_URL_RE = new RegExp(
  `/storage/v1/object/sign/${SOURCE_BUCKET}/([^?]+)`,
);

function extractSignedPath(url) {
  if (typeof url !== "string" || !url) return null;
  const m = url.match(SIGNED_URL_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Field descriptors: how to read/write the URL(s) on a products row. */
const PRODUCT_SCALAR_FIELDS = [
  "media_url",
  "secondary_media_url",
  "tertiary_media_url",
  "logo_url",
  "cta_banner_background_image_url",
];

function collectProductPaths(row) {
  const found = [];
  for (const field of PRODUCT_SCALAR_FIELDS) {
    const p = extractSignedPath(row[field]);
    if (p) found.push({ field, path: p });
  }
  for (const [i, url] of (row.gallery ?? []).entries()) {
    const p = extractSignedPath(url);
    if (p) found.push({ field: `gallery[${i}]`, path: p });
  }
  for (const lang of ["testimonials_ar", "testimonials_fr"]) {
    for (const [i, t] of (row[lang] ?? []).entries()) {
      const p = extractSignedPath(t?.image);
      if (p) found.push({ field: `${lang}[${i}].image`, path: p });
    }
  }
  return found;
}

async function main() {
  console.log(APPLY ? "Running in APPLY mode (writes will happen).\n" : "Running in DRY-RUN mode (no writes — pass --apply to execute).\n");

  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select(
      "id, slug, media_url, secondary_media_url, tertiary_media_url, gallery, testimonials_ar, testimonials_fr, logo_url, cta_banner_background_image_url",
    );
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

  // Collect every distinct bucket-relative path referenced anywhere.
  const pathToNewUrl = new Map();
  const rowsByProduct = new Map();
  for (const row of products ?? []) {
    const hits = collectProductPaths(row);
    if (hits.length === 0) continue;
    rowsByProduct.set(row.id, { slug: row.slug, hits });
    for (const h of hits) pathToNewUrl.set(h.path, null);
  }

  const campaignHits = [];
  for (const c of campaigns ?? []) {
    const p = extractSignedPath(c.image_url);
    if (p) {
      campaignHits.push({ id: c.id, path: p });
      pathToNewUrl.set(p, null);
    }
  }

  const uniquePaths = [...pathToNewUrl.keys()];
  console.log(`Found ${uniquePaths.length} distinct ${SOURCE_BUCKET} object(s) referenced by signed URLs.\n`);

  const failures = [];
  for (const objPath of uniquePaths) {
    if (!APPLY) {
      pathToNewUrl.set(objPath, `[dry-run] would copy to ${DEST_BUCKET}/${objPath}`);
      continue;
    }
    try {
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from(SOURCE_BUCKET)
        .download(objPath);
      if (downloadErr || !fileData) {
        throw new Error(downloadErr?.message ?? "download returned no data");
      }
      const { error: uploadErr } = await supabase.storage
        .from(DEST_BUCKET)
        .upload(objPath, fileData, { upsert: true, contentType: fileData.type || undefined });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: pub } = supabase.storage.from(DEST_BUCKET).getPublicUrl(objPath);
      pathToNewUrl.set(objPath, pub.publicUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ path: objPath, error: message });
      console.error(`FAIL  copy ${objPath}: ${message}`);
    }
  }

  // Report + apply DB rewrites.
  let productFieldsTouched = 0;
  for (const [productId, { slug, hits }] of rowsByProduct) {
    const row = (products ?? []).find((p) => p.id === productId);
    const updates = {};
    let gallery = row.gallery ? [...row.gallery] : null;
    let testimonialsAr = row.testimonials_ar ? row.testimonials_ar.map((t) => ({ ...t })) : null;
    let testimonialsFr = row.testimonials_fr ? row.testimonials_fr.map((t) => ({ ...t })) : null;

    for (const { field, path: objPath } of hits) {
      const newUrl = pathToNewUrl.get(objPath);
      if (!newUrl || newUrl.startsWith("[dry-run]")) {
        console.log(`${slug} :: ${field} -> ${newUrl ?? "(copy failed, skipped)"}`);
        continue;
      }
      console.log(`${slug} :: ${field} -> ${newUrl}`);
      productFieldsTouched += 1;
      const galleryMatch = field.match(/^gallery\[(\d+)\]$/);
      const testimonialMatch = field.match(/^(testimonials_ar|testimonials_fr)\[(\d+)\]\.image$/);
      if (galleryMatch) {
        gallery[Number(galleryMatch[1])] = newUrl;
      } else if (testimonialMatch) {
        const list = testimonialMatch[1] === "testimonials_ar" ? testimonialsAr : testimonialsFr;
        list[Number(testimonialMatch[2])] = { ...list[Number(testimonialMatch[2])], image: newUrl };
      } else {
        updates[field] = newUrl;
      }
    }
    if (gallery && JSON.stringify(gallery) !== JSON.stringify(row.gallery)) updates.gallery = gallery;
    if (testimonialsAr && JSON.stringify(testimonialsAr) !== JSON.stringify(row.testimonials_ar)) {
      updates.testimonials_ar = testimonialsAr;
    }
    if (testimonialsFr && JSON.stringify(testimonialsFr) !== JSON.stringify(row.testimonials_fr)) {
      updates.testimonials_fr = testimonialsFr;
    }

    if (APPLY && Object.keys(updates).length > 0) {
      const { error } = await supabase.from("products").update(updates).eq("id", productId);
      if (error) {
        failures.push({ path: `product:${slug}`, error: error.message });
        console.error(`FAIL  update product ${slug}: ${error.message}`);
      }
    }
  }

  for (const { id, path: objPath } of campaignHits) {
    const newUrl = pathToNewUrl.get(objPath);
    console.log(`marketing_campaigns:${id} :: image_url -> ${newUrl ?? "(copy failed, skipped)"}`);
    if (APPLY && newUrl && !newUrl.startsWith("[dry-run]")) {
      const { error } = await supabase
        .from("marketing_campaigns")
        .update({ image_url: newUrl })
        .eq("id", id);
      if (error) {
        failures.push({ path: `campaign:${id}`, error: error.message });
        console.error(`FAIL  update campaign ${id}: ${error.message}`);
      }
    }
  }

  console.log(`\n${productFieldsTouched} product field(s) ${APPLY ? "rewritten" : "would be rewritten"}, ${campaignHits.length} campaign row(s) referenced.`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f.path}: ${f.error}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDry run complete — no changes made. Re-run with --apply to execute.");
  } else {
    console.log("\nDone.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
