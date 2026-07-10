import fs from "fs";
import path from "path";

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

function normalizeMetaPixelId(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/^['"`]+|['"`]+$/g, "").trim();
    if (next === s) break;
    s = next;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 20) return digits;
  if (/^\d{10,20}$/.test(s)) return s;
  return null;
}

function validateMetaPixelEnv(env) {
  const browserPixelId = normalizeMetaPixelId(env.NEXT_PUBLIC_META_PIXEL_ID);
  const serverPixelId = normalizeMetaPixelId(env.META_PIXEL_ID);
  const warnings = [];

  if (!browserPixelId) {
    warnings.push(
      "NEXT_PUBLIC_META_PIXEL_ID missing — browser Pixel events will not fire.",
    );
  }
  if (!serverPixelId) {
    warnings.push("META_PIXEL_ID missing — server CAPI events will not fire.");
  }

  if (browserPixelId && serverPixelId && browserPixelId !== serverPixelId) {
    return {
      ok: false,
      error: `Meta Pixel ID mismatch: NEXT_PUBLIC_META_PIXEL_ID (${browserPixelId.slice(0, 6)}…) ≠ META_PIXEL_ID (${serverPixelId.slice(0, 6)}…).`,
      browserPixelId,
      serverPixelId,
      warnings,
    };
  }

  return {
    ok: Boolean(browserPixelId || serverPixelId),
    error: null,
    browserPixelId,
    serverPixelId,
    idsMatch:
      browserPixelId && serverPixelId ? browserPixelId === serverPixelId : null,
    warnings,
  };
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };

const metaKeys = [
  "META_CAPI_ACCESS_TOKEN",
  "META_PIXEL_ID",
  "NEXT_PUBLIC_META_PIXEL_ID",
  "META_CAPI_VERSION",
  "NEXT_PUBLIC_SITE_URL",
];

console.log("=== Meta env vars ===");
for (const k of metaKeys) {
  const v = env[k];
  console.log(`${k}: ${v ? `set (${v.length} chars)` : "MISSING"}`);
}

const pixelValidation = validateMetaPixelEnv(env);
console.log("\n=== Unified Meta Pixel validation ===");
if (pixelValidation.error) {
  console.error("ERROR:", pixelValidation.error);
  process.exitCode = 1;
} else {
  console.log("Pixel env: OK (no mismatch)");
}
if (pixelValidation.browserPixelId) {
  console.log(`Browser pixel prefix: ${pixelValidation.browserPixelId.slice(0, 6)}…`);
}
if (pixelValidation.serverPixelId) {
  console.log(`Server pixel prefix: ${pixelValidation.serverPixelId.slice(0, 6)}…`);
}
for (const w of pixelValidation.warnings) {
  console.warn("WARN:", w);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("\nCannot query Supabase: missing URL or key");
  process.exit(pixelValidation.error ? 1 : 0);
}

const res = await fetch(
  `${url.replace(/\/$/, "")}/rest/v1/products?select=id,slug,name_ar,meta_pixel_id,test_status&order=created_at.desc&limit=10`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  },
);

if (!res.ok) {
  console.log("\nProducts query failed:", res.status, await res.text());
  process.exit(1);
}

const products = await res.json();
const legacyCount = products.filter((p) => p.meta_pixel_id).length;
console.log("\n=== Legacy per-product meta_pixel_id (informational) ===");
console.log(
  `Products with non-null meta_pixel_id in latest 10 rows: ${legacyCount} (ignored for event routing)`,
);
for (const p of products) {
  if (p.meta_pixel_id) {
    console.log(`- ${p.slug}: legacy meta_pixel_id set (not used for routing)`);
  }
}

const legacyAllRes = await fetch(
  `${url.replace(/\/$/, "")}/rest/v1/products?select=id&meta_pixel_id=not.is.null&deleted_at=is.null`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  },
);

if (legacyAllRes.ok) {
  const range = legacyAllRes.headers.get("content-range");
  const total = range?.split("/")?.[1];
  if (total != null) {
    console.log(`Total active products with legacy meta_pixel_id: ${total}`);
  }
}

const ordersRes = await fetch(
  `${url.replace(/\/$/, "")}/rest/v1/orders?select=id,status,meta_lead_sent,meta_purchase_sent,meta_event_id&order=created_at.desc&limit=5`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  },
);

if (ordersRes.ok) {
  const orders = await ordersRes.json();
  console.log("\n=== Recent orders (Meta flags) ===");
  for (const o of orders) {
    console.log(
      `- ${o.id.slice(0, 8)}… status=${o.status} lead_sent=${o.meta_lead_sent} purchase_sent=${o.meta_purchase_sent} event_id=${o.meta_event_id ? "set" : "NULL"}`,
    );
  }
} else {
  console.log("\nOrders query failed:", ordersRes.status);
}

if (pixelValidation.error) {
  process.exit(1);
}
