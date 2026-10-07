/**
 * POST /api/orders (storefront checkout): the order row it inserts.
 *
 * Supabase is the in-memory FakeDb; the rate limiter, duplicate guard, Meta
 * dispatch, OneSignal, Google Sheets and pixel lookup are module mocks, so no
 * network call is made. `after()` callbacks are captured and run explicitly.
 * Requires `--experimental-test-module-mocks` (set in the npm test script).
 */
import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import { FakeDb } from "./support/fake-supabase.ts";

const src = (path: string) => new URL(`../src/${path}`, import.meta.url).href;

process.env.ORDER_ACTION_SECRET = "test-order-action-secret-0123456789";

const MR = "11111111-1111-4111-8111-111111111111";
const SA = "22222222-2222-4222-8222-222222222222";
const XX = "33333333-3333-4333-8333-333333333333";
const OWNED_PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AFFILIATE_PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BROKEN_AFFILIATE_PRODUCT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db = new FakeDb();
let afterCallbacks: Array<() => unknown> = [];
const metaCalls: Array<{ orderId: string; eventType: string }> = [];
const sheetCalls: Array<{ url: string; row: Record<string, unknown> }> = [];

type RouteHandler = (request: Request) => Promise<Response>;
let POST: RouteHandler;

// Mocks must be registered before the route module (and its imports) load.
before(async () => {
  const realNextServer = await import("next/server");
  const realService = await import(src("lib/supabase/service.ts"));

  mock.module("next/server", {
    namedExports: {
      ...realNextServer,
      after: (callback: () => unknown) => {
        afterCallbacks.push(callback);
      },
    },
  });
  mock.module(src("lib/supabase/service.ts"), {
    namedExports: { normalizeEnv: realService.normalizeEnv, createServiceClient: () => db.client() },
  });
  mock.module(src("lib/rate-limit/order-create.ts"), {
    namedExports: { checkOrderCreateRateLimit: async () => ({ allowed: true }) },
  });
  mock.module(src("lib/orders/duplicate-guard.ts"), {
    namedExports: { DUPLICATE_ORDER_ERROR_AR: "duplicate", hasRecentDuplicateOrder: async () => false },
  });
  mock.module(src("lib/meta/dispatch.ts"), {
    namedExports: {
      dispatchMetaEvent: async (_supabase: unknown, orderId: string, eventType: string) => {
        metaCalls.push({ orderId, eventType });
        return { sent: true };
      },
    },
  });
  mock.module(src("lib/onesignal/post-order-notify.ts"), {
    namedExports: {
      resolveOrderProductName: () => "product",
      notifyAdminsOfNewOrder: async () => ({ sent: false, skipped: true, reason: "test" }),
    },
  });
  mock.module(src("lib/google-sheets/affiliate-order-sheet.ts"), {
    namedExports: {
      appendAffiliateOrderRow: async (url: string, row: Record<string, unknown>) => {
        sheetCalls.push({ url, row });
      },
    },
  });
  mock.module(src("lib/meta-pixel-id.ts"), {
    namedExports: {
      resolveCountryPixelIds: async () => ({ public: null, server: null, isoCode: null }),
      resolveServerMetaPixelId: () => "999",
    },
  });
  mock.module(src("lib/order-communication-log.ts"), {
    namedExports: { logOrderCommunicationEvent: async () => {} },
  });

  ({ POST } = await import(src("app/api/orders/route.ts")));
});

function product(overrides: Record<string, unknown>) {
  return {
    discount_price: null,
    price: 1000,
    test_status: "winner",
    name_ar: "منتج",
    name_fr: "",
    deleted_at: null,
    fulfillment_type: "owned",
    affiliate_sku: null,
    affiliate_currency: null,
    affiliate_sheet_url: null,
    cost_price: 400,
    affiliate_commission_type: null,
    affiliate_fixed_commission: null,
    affiliate_sell_price: null,
    ...overrides,
  };
}

beforeEach(() => {
  db = new FakeDb();
  afterCallbacks = [];
  metaCalls.length = 0;
  sheetCalls.length = 0;
  db.seed("countries", [
    { id: MR, name_ar: "موريتانيا", currency: "MRU" },
    { id: SA, name_ar: "السعودية", currency: "SAR" },
    // A country row with no currency: affiliate orders must be refused.
    { id: XX, name_ar: "بلا عملة", currency: null },
  ]);
  db.seed("products", [
    product({ id: OWNED_PRODUCT, country_id: MR, discount_price: 900 }),
    product({
      id: AFFILIATE_PRODUCT,
      country_id: SA,
      fulfillment_type: "affiliate",
      // Legacy free-text value — must NOT become the order currency.
      affiliate_currency: "ريال",
      affiliate_sheet_url: "https://sheet.example/x",
      affiliate_sku: "SKU-1",
      affiliate_commission_type: "fixed",
      affiliate_fixed_commission: 20,
      price: 150,
      cost_price: 50,
    }),
    product({ id: BROKEN_AFFILIATE_PRODUCT, country_id: XX, fulfillment_type: "affiliate" }),
  ]);
});

function request(body: Record<string, unknown>): Request {
  return new Request("https://store.example/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "test", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

async function runAfterCallbacks() {
  for (const callback of afterCallbacks) await callback();
}

test("owned order: country_id from the product, MRU, cost snapshot, one Lead", async () => {
  const res = await POST(request({ product_id: OWNED_PRODUCT, customer_name: "Ali", phone: "+22246123456" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);

  const orders = db.rows("orders");
  assert.equal(orders.length, 1);
  const order = orders[0];
  assert.equal(order.country_id, MR);
  assert.equal(order.currency, "MRU");
  assert.equal(order.status, "pending");
  assert.equal(order.total_price, 900);
  assert.equal(order.unit_price, 900);
  assert.equal(order.unit_cost_price, 400);
  assert.equal(order.affiliate_address, null);

  await runAfterCallbacks();
  assert.deepEqual(metaCalls, [{ orderId: body.order_id, eventType: "lead" }]);
  assert.equal(sheetCalls.length, 0);
});

test("affiliate order: country_id and ISO currency from the product's country, sheet append", async () => {
  const res = await POST(
    request({
      product_id: AFFILIATE_PRODUCT,
      customer_name: "Sara",
      phone: "+966501234567",
      affiliate_address: "Street 1",
      affiliate_city: "Riyadh",
      affiliate_country: "SA",
    }),
  );
  assert.equal(res.status, 200);

  const [order] = db.rows("orders");
  assert.equal(order.country_id, SA);
  assert.equal(order.currency, "SAR");
  assert.equal(order.affiliate_city, "Riyadh");
  assert.equal(order.affiliate_commission_type_at_order, "fixed");
  assert.equal(order.affiliate_fixed_commission_at_order, 20);

  await runAfterCallbacks();
  assert.equal(sheetCalls.length, 1);
  assert.equal(sheetCalls[0].row.currency, "SAR");
  assert.equal(metaCalls.filter((c) => c.eventType === "lead").length, 1);
});

test("affiliate order without address is rejected before any insert", async () => {
  const res = await POST(
    request({ product_id: AFFILIATE_PRODUCT, customer_name: "Sara", phone: "+966501234567" }),
  );
  assert.equal(res.status, 400);
  assert.equal(db.rows("orders").length, 0);
});

test("affiliate product whose country has no currency: refused, nothing inserted", async () => {
  const res = await POST(
    request({
      product_id: BROKEN_AFFILIATE_PRODUCT,
      customer_name: "X",
      phone: "+966501234567",
      affiliate_address: "a",
      affiliate_city: "b",
      affiliate_country: "SA",
    }),
  );
  assert.equal(res.status, 500);
  assert.equal(db.rows("orders").length, 0);
});

test("archived product: 404, nothing inserted", async () => {
  db.rows("products").find((p) => p.id === OWNED_PRODUCT)!.deleted_at = new Date().toISOString();
  const res = await POST(request({ product_id: OWNED_PRODUCT, customer_name: "Ali", phone: "+22246123456" }));
  assert.equal(res.status, 404);
  assert.equal(db.rows("orders").length, 0);
});
