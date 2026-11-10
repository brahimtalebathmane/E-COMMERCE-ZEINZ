/**
 * Ad set linking (078): spend split by ad set, all-or-nothing sync, and the
 * campaign / ad set exclusion on the server. Meta's Graph API (fetch) is
 * mocked; the database is the in-memory fake. The exclusion trigger itself
 * (and its concurrency lock) is covered by tests/pglite/scenarios/ad-sets-078.mjs.
 * Requires `--experimental-test-module-mocks` (set in the npm test script).
 */
import { afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import { FakeDb } from "./support/fake-supabase.ts";

const src = (path: string) => new URL(`../src/${path}`, import.meta.url).href;

const ACCOUNT = "123456";
const USD_TO_MRU = 43;

// One niche campaign with three ad sets, one per product (the new structure),
// plus an older single-product campaign linked whole.
const NICHE_CAMPAIGN = "900";
const OLD_CAMPAIGN = "800";
const AD_SET = { p1: "901", p2: "902", p3: "903" };
const P = { p1: "prod-1", p2: "prod-2", p3: "prod-3", p4: "prod-4" };

type InsightsLevel = "campaign" | "adset" | "account";
type Requested = { level: InsightsLevel; filterIds: string[] | null };

let db: FakeDb;
let requested: Requested[] = [];
/** level -> rows Meta returns (spend in USD). */
let insightsRows: Record<InsightsLevel, Record<string, string>[]> = { campaign: [], adset: [], account: [] };
/** level -> forced HTTP status, or "truncated" to page forever. */
let insightsFailure: Partial<Record<InsightsLevel, number | "truncated">> = {};
/** ad set id -> Graph object Meta returns for GET /{id}. */
let adSetObjects: Record<string, { id: string; campaign_id: string; name: string; account_id: string }> = {};

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function installFetch() {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname !== "graph.facebook.com") return json({}, 404);
    const parts = url.pathname.split("/").filter(Boolean); // [version, id, edge?]

    if (parts[1] === `act_${ACCOUNT}` && parts[2] === "insights") {
      const level = url.searchParams.get("level") as InsightsLevel;
      const filtering = url.searchParams.get("filtering");
      if (!url.searchParams.get("page")) {
        requested.push({
          level,
          filterIds: filtering ? (JSON.parse(filtering)[0].value as string[]) : null,
        });
      }
      const failure = insightsFailure[level];
      if (typeof failure === "number") return json({ error: { message: "boom" } }, failure);
      if (failure === "truncated") {
        const next = new URL(url);
        next.searchParams.set("page", String(Number(url.searchParams.get("page") ?? 0) + 1));
        return json({ data: [], paging: { next: next.toString() } });
      }
      return json({ data: insightsRows[level].map((r) => ({ ...r, account_currency: "USD" })) });
    }

    if (parts.length === 2) {
      const obj = adSetObjects[parts[1]];
      if (!obj) return json({ error: { message: "Unsupported get request", code: 100 } }, 400);
      return json(obj);
    }
    return json({}, 404);
  }) as typeof fetch;
}

function seedLinks() {
  db.seed("currency_rates", [{ code: "USD", mru_per_unit: USD_TO_MRU }]);
  db.seed("products", [
    { id: P.p1, name_ar: "منتج 1", created_at: "2026-10-01T00:00:00Z", country_id: "mr" },
    { id: P.p2, name_ar: "منتج 2", created_at: "2026-10-01T00:00:00Z", country_id: "mr" },
    { id: P.p3, name_ar: "منتج 3", created_at: "2026-10-01T00:00:00Z", country_id: "mr" },
    { id: P.p4, name_ar: "منتج 4", created_at: "2026-10-01T00:00:00Z", country_id: "mr" },
  ]);
  db.seed("product_ad_sets", [
    { id: "s1", product_id: P.p1, meta_adset_id: AD_SET.p1, meta_campaign_id: NICHE_CAMPAIGN, label: "AS 1" },
    { id: "s2", product_id: P.p2, meta_adset_id: AD_SET.p2, meta_campaign_id: NICHE_CAMPAIGN, label: "AS 2" },
    { id: "s3", product_id: P.p3, meta_adset_id: AD_SET.p3, meta_campaign_id: NICHE_CAMPAIGN, label: "AS 3" },
  ]);
  db.seed("product_ad_campaigns", [{ id: "c4", product_id: P.p4, meta_campaign_id: OLD_CAMPAIGN, label: "old" }]);
}

// The 2026-11-09 / 10 situation, in USD as Meta reports it.
const NOV9 = "2026-11-09";
const NOV10 = "2026-11-10";
function seedMetaNumbers() {
  insightsRows = {
    adset: [
      { adset_id: AD_SET.p1, campaign_id: NICHE_CAMPAIGN, date_start: NOV9, spend: "3.10" },
      { adset_id: AD_SET.p1, campaign_id: NICHE_CAMPAIGN, date_start: NOV10, spend: "8.20" },
      { adset_id: AD_SET.p2, campaign_id: NICHE_CAMPAIGN, date_start: NOV10, spend: "9.55" },
      { adset_id: AD_SET.p3, campaign_id: NICHE_CAMPAIGN, date_start: NOV9, spend: "1.00" },
      { adset_id: AD_SET.p3, campaign_id: NICHE_CAMPAIGN, date_start: NOV10, spend: "5.13" },
    ],
    campaign: [
      { campaign_id: OLD_CAMPAIGN, date_start: NOV9, spend: "42.98" },
      { campaign_id: OLD_CAMPAIGN, date_start: NOV10, spend: "2.15" },
    ],
    // The account total: exactly the niche campaign's three ad sets + the old campaign.
    account: [
      { date_start: NOV9, spend: "47.08" },
      { date_start: NOV10, spend: "25.03" },
    ],
  };
}

type Sync = typeof import("../src/lib/analytics/ad-spend-sync.ts");
type Unattributed = typeof import("../src/lib/analytics/unattributed-spend.ts");
type Actions = typeof import("../src/app/admin/(dashboard)/analytics/actions.ts");
let sync: Sync;
let unattributed: Unattributed;
let actions: Actions;

before(async () => {
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
  mock.module(src("lib/auth/admin.ts"), {
    namedExports: { assertPermission: async () => ({ access: { userId: "owner-1", isOwner: true } }) },
  });
  mock.module(src("lib/auth/country-scope.ts"), {
    namedExports: {
      requireCountryScope: async () => ({ countryId: "mr" }),
      getCountryScope: async () => ({ selectedCountryId: "mr" }),
      assertInCountryScope: () => {},
    },
  });
  mock.module(src("lib/supabase/service.ts"), {
    namedExports: { createServiceClient: () => db.client() },
  });
  sync = await import("../src/lib/analytics/ad-spend-sync.ts");
  unattributed = await import("../src/lib/analytics/unattributed-spend.ts");
  actions = await import("../src/app/admin/(dashboard)/analytics/actions.ts");
});

beforeEach(() => {
  db = new FakeDb();
  requested = [];
  insightsFailure = {};
  adSetObjects = {};
  process.env.META_MARKETING_ACCESS_TOKEN = "token";
  process.env.META_AD_ACCOUNT_ID = `act_${ACCOUNT}`;
  installFetch();
  seedLinks();
  seedMetaNumbers();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

const window = { productIds: Object.values(P), sinceISODate: NOV9, untilISODate: NOV10 };
const cents = (n: unknown) => Math.round(Number(n) * 100);
function spendOf(productId: string, date: string) {
  return db.rows("product_ad_spend_daily").find((r) => r.product_id === productId && r.date === date);
}

test("one campaign with 3 ad sets linked to 3 products: spend splits exactly, nothing lost, nothing doubled", async () => {
  const res = await sync.syncProductAdSpend(db.client(), window);
  assert.deepEqual(res, { ok: true, incompleteProductIds: [] });

  // One batched request per level; the niche campaign is NOT requested whole.
  assert.deepEqual(
    requested.map((r) => [r.level, r.filterIds?.slice().sort() ?? null]).sort(),
    [
      ["account", null],
      ["adset", [AD_SET.p1, AD_SET.p2, AD_SET.p3]],
      ["campaign", [OLD_CAMPAIGN]],
    ],
  );

  const expected: Record<string, Record<string, number>> = {
    [P.p1]: { [NOV9]: 310, [NOV10]: 820 },
    [P.p2]: { [NOV9]: 0, [NOV10]: 955 }, // no spend on Nov 9 → written as 0, the window is complete
    [P.p3]: { [NOV9]: 100, [NOV10]: 513 },
    [P.p4]: { [NOV9]: 4298, [NOV10]: 215 },
  };
  for (const [pid, byDate] of Object.entries(expected)) {
    for (const [date, usdCents] of Object.entries(byDate)) {
      const row = spendOf(pid, date);
      assert.ok(row, `${pid} ${date} written`);
      assert.equal(cents(row.source_amount), usdCents, `${pid} ${date} source`);
      assert.equal(Math.round(Number(row.amount)), Math.round((usdCents / 100) * USD_TO_MRU), `${pid} ${date} MRU`);
      assert.equal(row.source_currency, "USD");
    }
  }
  assert.equal(db.rows("product_ad_spend_daily").length, 8);

  // Products sum to the account total every day: unattributed = 0.
  const days = unattributed.computeUnattributedDaily({
    accountRows: db.rows("ad_account_spend_daily").map((r) => ({
      date: String(r.date),
      amount: Number(r.amount),
      source_amount: Number(r.source_amount),
      source_currency: String(r.source_currency),
    })),
    productRows: db.rows("product_ad_spend_daily").map((r) => ({
      date: String(r.date),
      source_amount: Number(r.source_amount),
      source_currency: String(r.source_currency),
    })),
  });
  assert.deepEqual(
    days.map((d) => [d.date, d.accountSource, d.unattributedSource]),
    [
      [NOV10, 25.03, 0],
      [NOV9, 47.08, 0],
    ],
  );
  assert.equal(db.rows("ad_account_spend_daily")[0].ad_account_id, ACCOUNT);

  // Re-running overwrites, never adds.
  await sync.syncProductAdSpend(db.client(), window);
  assert.equal(cents(spendOf(P.p2, NOV10)!.source_amount), 955);
  assert.equal(db.rows("product_ad_spend_daily").length, 8);
});

test("before the fix (niche campaign unlinked) the gap shows as unattributed spend", async () => {
  db.replace("product_ad_sets", []);
  await sync.syncProductAdSpend(db.client(), window);
  const days = unattributed.computeUnattributedDaily({
    accountRows: db.rows("ad_account_spend_daily") as never,
    productRows: db.rows("product_ad_spend_daily") as never,
  });
  const nov10 = days.find((d) => d.date === NOV10)!;
  assert.equal(nov10.attributedSource, 2.15);
  assert.equal(nov10.unattributedSource, 22.88);
  assert.ok(unattributed.isUnattributedSignificant(nov10));
});

for (const [label, failure] of [
  ["campaign request fails (HTTP 500)", { campaign: 500 }],
  ["ad set request fails (HTTP 500)", { adset: 500 }],
  ["ad set request truncated at the page cap", { adset: "truncated" }],
  ["account request fails (HTTP 400)", { account: 400 }],
] as const) {
  test(`all or nothing: ${label} → nothing written, cached rows kept`, async () => {
    const cached = [
      { product_id: P.p1, date: NOV10, amount: 1, source_amount: 0.02, source_currency: "USD", fetched_at: "old" },
      { product_id: P.p4, date: NOV10, amount: 92.45, source_amount: 2.15, source_currency: "USD", fetched_at: "old" },
    ];
    db.seed("product_ad_spend_daily", cached);
    insightsFailure = failure;

    const res = await sync.syncProductAdSpend(db.client(), window);
    assert.equal(res.ok, false);
    assert.deepEqual(db.rows("product_ad_spend_daily"), cached);
    assert.deepEqual(db.rows("ad_account_spend_daily"), []);
  });
}

test("A13: a linked ad set Meta reports nothing for gets no zero rows", async () => {
  insightsRows.adset = insightsRows.adset.filter((r) => r.adset_id !== AD_SET.p3);
  const res = await sync.syncProductAdSpend(db.client(), window);
  assert.deepEqual(res, { ok: true, incompleteProductIds: [P.p3] });
  assert.equal(db.rows("product_ad_spend_daily").filter((r) => r.product_id === P.p3).length, 0);
});

test("defence in depth: a campaign somehow linked whole AND by ad sets is counted once", async () => {
  db.seed("product_ad_campaigns", [{ id: "c9", product_id: P.p4, meta_campaign_id: NICHE_CAMPAIGN }]);
  await sync.syncProductAdSpend(db.client(), window);
  const adsetReq = requested.find((r) => r.level === "adset");
  assert.equal(adsetReq, undefined, "ad sets of a whole-linked campaign are not fetched");
});

test("a product with only an ad set link counts as linked (stale check, month sync)", async () => {
  const links = await sync.loadAdLinks(db.client(), [P.p1, P.p4]);
  assert.ok(links.ok);
  assert.deepEqual(sync.linkedProductIds(links.links).sort(), [P.p1, P.p4].sort());
});

// ── Server actions: exclusion both directions, Meta lookup ───────────────────

test("exclusion: an ad set whose campaign is linked whole is refused", async () => {
  adSetObjects["777"] = { id: "777", campaign_id: OLD_CAMPAIGN, name: "AS old", account_id: ACCOUNT };
  const before = db.rows("product_ad_sets").length;
  const res = await actions.linkAdSetAction(P.p1, "777");
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /مربوطة كاملة/);
  assert.equal(db.rows("product_ad_sets").length, before);
  assert.equal(requested.length, 0, "no sync after a refused link");
});

test("exclusion: a campaign whose ad sets are linked can't be linked whole", async () => {
  const before = db.rows("product_ad_campaigns").length;
  const res = await actions.linkAdCampaignAction(P.p4, NICHE_CAMPAIGN);
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /مجموعات إعلانية من هذه الحملة مربوطة/);
  assert.equal(db.rows("product_ad_campaigns").length, before);
});

test("linking an ad set stores Meta's campaign id and name, then backfills", async () => {
  adSetObjects["904"] = { id: "904", campaign_id: NICHE_CAMPAIGN, name: "Niche — product 4 test", account_id: ACCOUNT };
  insightsRows.adset.push({ adset_id: "904", campaign_id: NICHE_CAMPAIGN, date_start: NOV10, spend: "1.00" });
  db.replace("product_ad_campaigns", []);

  const res = await actions.linkAdSetAction(P.p4, "904");
  assert.ok(res.ok, !res.ok ? res.error : "");
  const row = db.rows("product_ad_sets").find((r) => r.meta_adset_id === "904")!;
  assert.equal(row.meta_campaign_id, NICHE_CAMPAIGN);
  assert.equal(row.label, "Niche — product 4 test");
  assert.equal(row.product_id, P.p4);
  assert.ok(requested.some((r) => r.level === "adset" && r.filterIds?.includes("904")), "backfill ran");
  assert.equal(cents(spendOf(P.p4, NOV10)?.source_amount), 100);
});

test("an unknown ad set id or one from another ad account is refused", async () => {
  adSetObjects["905"] = { id: "905", campaign_id: "1", name: "foreign", account_id: "999999" };
  const unknown = await actions.linkAdSetAction(P.p1, "404404");
  const foreign = await actions.linkAdSetAction(P.p1, "905");
  const garbage = await actions.linkAdSetAction(P.p1, "12a");
  assert.match(!unknown.ok ? unknown.error : "", /لم يتم العثور/);
  assert.match(!foreign.ok ? foreign.error : "", /حساب إعلاني آخر/);
  assert.equal(garbage.ok, false);
  assert.equal(db.rows("product_ad_sets").length, 3);
});

test("an ad set already linked to another product is refused", async () => {
  adSetObjects[AD_SET.p1] = { id: AD_SET.p1, campaign_id: NICHE_CAMPAIGN, name: "AS 1", account_id: ACCOUNT };
  db.replace("product_ad_campaigns", []);
  const res = await actions.linkAdSetAction(P.p2, AD_SET.p1);
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /مربوطة بالفعل بالمنتج/);
  assert.equal(db.rows("product_ad_sets").filter((r) => r.meta_adset_id === AD_SET.p1).length, 1);
});
