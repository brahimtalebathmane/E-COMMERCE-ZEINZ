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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("\nCannot query Supabase: missing URL or key");
  process.exit(0);
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
console.log("\n=== Products (meta_pixel_id) ===");
for (const p of products) {
  console.log(
    `- ${p.slug} (${p.test_status}): meta_pixel_id=${p.meta_pixel_id ? "set" : "NULL"}`,
  );
}

const ordersRes = await fetch(
  `${url.replace(/\/$/, "")}/rest/v1/orders?select=id,status,meta_pixel_id,meta_lead_sent,meta_purchase_sent,meta_event_id&order=created_at.desc&limit=5`,
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
      `- ${o.id.slice(0, 8)}… status=${o.status} pixel=${o.meta_pixel_id ? "set" : "NULL"} lead_sent=${o.meta_lead_sent} purchase_sent=${o.meta_purchase_sent} event_id=${o.meta_event_id ? "set" : "NULL"}`,
    );
  }
} else {
  console.log("\nOrders query failed:", ordersRes.status);
}
