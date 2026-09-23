/**
 * WhatsApp Purchase dual send: pixel leg + WhatsApp dataset leg, and the
 * dataset-gap resend. Meta's transport (fetch to graph.facebook.com) is mocked;
 * every assertion reads the requests each leg actually made.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { dispatchMetaEvent } from "../src/lib/meta/dispatch.ts";
import { DATASET_RESEND_WINDOW_MS, runDatasetResend } from "../src/lib/meta/dataset-resend.ts";
import { FakeDb } from "./support/fake-supabase.ts";

const PIXEL_ID = "1111111111";
const DATASET_ID = "2222222222";
const WABA_ID = "3333333333";
const PIXEL_TOKEN = "pixel-token";
const WHATSAPP_TOKEN = "whatsapp-token";

type MetaCall = {
  destinationId: string;
  accessToken: string | null;
  event: Record<string, unknown>;
};

let calls: MetaCall[] = [];
/** Per-destination canned response; defaults to accepted. */
let responder: (destinationId: string) => { status: number; body: unknown } = () => ({
  status: 200,
  body: { events_received: 1, fbtrace_id: "trace" },
});

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

beforeEach(() => {
  calls = [];
  responder = () => ({ status: 200, body: { events_received: 1, fbtrace_id: "trace" } });
  process.env.META_PIXEL_ID = PIXEL_ID;
  process.env.META_CAPI_ACCESS_TOKEN = PIXEL_TOKEN;
  process.env.META_WHATSAPP_DATASET_ID = DATASET_ID;
  process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID = WABA_ID;
  process.env.META_WHATSAPP_CAPI_ACCESS_TOKEN = WHATSAPP_TOKEN;
  process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example.com";
  delete process.env.META_WHATSAPP_PIXEL_LEG;
  delete process.env.META_CAPI_TEST_EVENT_CODE;
  // Keep the admin push-notification path inert.
  delete process.env.ONESIGNAL_REST_API_KEY;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const match = url.hostname === "graph.facebook.com" && url.pathname.match(/\/([^/]+)\/events$/);
    if (!match) return new Response("{}", { status: 404 });
    const payload = JSON.parse(String(init?.body)) as { data: Record<string, unknown>[] };
    calls.push({
      destinationId: match[1],
      accessToken: url.searchParams.get("access_token"),
      event: payload.data[0],
    });
    const { status, body } = responder(match[1]);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

function setup(order: Record<string, unknown>) {
  const db = new FakeDb();
  db.seed("products", [
    { id: "prod-1", name_ar: "منتج", name_fr: "Produit", default_language: "ar", slug: "produit", country_id: null },
  ]);
  db.seed("orders", [
    {
      id: "order-1",
      product_id: "prod-1",
      status: "confirmed",
      customer_name: "Ahmed Salem",
      phone: "+22236000000",
      total_price: 4000,
      currency: "MRU",
      quantity: 1,
      source: "manual",
      manual_sale_channel: "whatsapp",
      meta_ctwa_clid: "clid-abc",
      meta_lead_sent: false,
      meta_purchase_sent: false,
      meta_purchase_dataset_sent: false,
      meta_cancel_sent: false,
      meta_dataset_last_error: null,
      meta_dataset_resend_claimed_at: null,
      ordered_at: new Date().toISOString(),
      deleted_at: null,
      ...order,
    },
  ]);
  return { db, supabase: db.client(), order: () => db.find("orders", "order-1")! };
}

const pixelCalls = () => calls.filter((c) => c.destinationId === PIXEL_ID);
const datasetCalls = () => calls.filter((c) => c.destinationId === DATASET_ID);

function assertPixelLegShape(call: MetaCall, actionSource: string) {
  const userData = call.event.user_data as Record<string, unknown>;
  assert.equal(call.accessToken, PIXEL_TOKEN, "pixel leg uses the website token, no override");
  assert.equal(call.event.action_source, actionSource);
  assert.equal(call.event.messaging_channel, undefined);
  assert.equal(userData.ctwa_clid, undefined);
  assert.equal(userData.whatsapp_business_account_id, undefined);
}

// 1 ─ WhatsApp sale with a click id: chat on the pixel + business_messaging on the dataset.
test("attributable WhatsApp sale sends both legs and marks both flags", async () => {
  const { supabase, order } = setup({});

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 2);
  assert.equal(pixelCalls().length, 1);
  assert.equal(datasetCalls().length, 1);

  assertPixelLegShape(pixelCalls()[0], "chat");

  const dataset = datasetCalls()[0];
  const userData = dataset.event.user_data as Record<string, unknown>;
  assert.equal(dataset.accessToken, WHATSAPP_TOKEN);
  assert.equal(dataset.event.action_source, "business_messaging");
  assert.equal(dataset.event.messaging_channel, "whatsapp");
  assert.equal(userData.ctwa_clid, "clid-abc");
  assert.equal(userData.whatsapp_business_account_id, WABA_ID);

  // Same event_id on both destinations.
  assert.equal(pixelCalls()[0].event.event_id, "purchase_order-1");
  assert.equal(dataset.event.event_id, "purchase_order-1");

  assert.equal(order().meta_purchase_sent, true);
  assert.equal(order().meta_purchase_dataset_sent, true);
  assert.equal(order().meta_dataset_last_error, null);
});

// 2 ─ WhatsApp sale without a click id: pixel only.
test("WhatsApp sale without a click id sends exactly one pixel event", async () => {
  const { supabase, order } = setup({ meta_ctwa_clid: null });

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(pixelCalls().length, 1);
  assertPixelLegShape(pixelCalls()[0], "chat");
  assert.equal(order().meta_purchase_dataset_sent, false);
  assert.equal(order().meta_dataset_last_error, null);
});

// 3 ─ Storefront sale: pixel only, action_source website, dataset never called.
test("storefront sale sends one website event and never touches the dataset", async () => {
  const { supabase } = setup({
    source: "storefront",
    manual_sale_channel: null,
    // Even a stray click id must not route a storefront order to the dataset.
    meta_ctwa_clid: "clid-stray",
    meta_client_ip_address: "41.188.1.1",
    meta_client_user_agent: "Mozilla/5.0",
    meta_fbp: "fb.1.1.1",
  });

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(datasetCalls().length, 0);
  assertPixelLegShape(pixelCalls()[0], "website");
  assert.equal(pixelCalls()[0].event.event_source_url, "https://shop.example.com/produit");
});

// 4 ─ Rejected dataset leg: the sale still counts as sent; the gap is recorded.
test("a rejected dataset leg leaves the sale sent and records the subcode", async () => {
  const { supabase, order } = setup({});
  responder = (id) =>
    id === DATASET_ID
      ? { status: 400, body: { error: { message: "ctwa_clid mismatch", error_subcode: 2804117 } } }
      : { status: 200, body: { events_received: 1 } };

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(pixelCalls().length, 1, "no fallback resend onto the pixel");
  assert.equal(datasetCalls().length, 1);
  assert.equal(order().meta_purchase_sent, true);
  assert.equal(order().meta_purchase_dataset_sent, false);
  assert.match(String(order().meta_dataset_last_error), /http_error subcode=2804117/);

  // …and it shows up in the gap.
  const dry = await runDatasetResend(supabase, { dryRun: true });
  assert.equal(dry.eligible, 1);
});

// 5 ─ No dataset configured: degrades to case 2.
test("without META_WHATSAPP_DATASET_ID no request is attempted against a dataset", async () => {
  delete process.env.META_WHATSAPP_DATASET_ID;
  const { supabase, order } = setup({});

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assertPixelLegShape(pixelCalls()[0], "chat");
  assert.equal(order().meta_purchase_dataset_sent, false);
});

// 6 ─ Kill switch.
test("META_WHATSAPP_PIXEL_LEG=off sends an attributable sale to the dataset only", async () => {
  process.env.META_WHATSAPP_PIXEL_LEG = "off";
  const { supabase, order } = setup({});

  const result = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(datasetCalls().length, 1);
  assert.equal(order().meta_purchase_sent, true);
  assert.equal(order().meta_purchase_dataset_sent, true);
});

test("META_WHATSAPP_PIXEL_LEG=off does not affect sales without a click id or storefront sales", async () => {
  process.env.META_WHATSAPP_PIXEL_LEG = "off";

  const noClick = setup({ meta_ctwa_clid: null });
  await dispatchMetaEvent(noClick.supabase, "order-1", "purchase");
  const storefront = setup({ source: "storefront", manual_sale_channel: null, meta_ctwa_clid: null });
  await dispatchMetaEvent(storefront.supabase, "order-1", "purchase");

  assert.equal(calls.length, 2);
  assert.equal(pixelCalls().length, 2);
  assert.deepEqual(
    pixelCalls().map((c) => c.event.action_source),
    ["chat", "website"],
  );
});

test("a malformed META_WHATSAPP_PIXEL_LEG keeps the pixel leg on", async () => {
  process.env.META_WHATSAPP_PIXEL_LEG = "disabled";
  const { supabase } = setup({});

  await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.equal(pixelCalls().length, 1);
  assert.equal(datasetCalls().length, 1);
});

// 7 ─ Idempotency, both legs.
test("dispatching twice sends nothing twice", async () => {
  const { supabase } = setup({});

  const first = await dispatchMetaEvent(supabase, "order-1", "purchase");
  const second = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(first, { sent: true });
  assert.equal(second.sent, false);
  assert.equal(pixelCalls().length, 1);
  assert.equal(datasetCalls().length, 1);
});

test("retrying after a failed pixel leg does not resend an accepted dataset leg", async () => {
  const { supabase, order } = setup({});
  responder = (id) =>
    id === PIXEL_ID
      ? { status: 400, body: { error: { message: "bad", error_subcode: 1 } } }
      : { status: 200, body: { events_received: 1 } };

  const first = await dispatchMetaEvent(supabase, "order-1", "purchase");
  assert.equal(first.sent, false);
  assert.equal(order().meta_purchase_sent, false);
  assert.equal(order().meta_purchase_dataset_sent, true);

  responder = () => ({ status: 200, body: { events_received: 1 } });
  const retry = await dispatchMetaEvent(supabase, "order-1", "purchase");

  assert.deepEqual(retry, { sent: true });
  assert.equal(pixelCalls().length, 2, "the pixel leg is retried");
  assert.equal(datasetCalls().length, 1, "the dataset leg is not");
});

test("concurrent dispatches for one order send each leg once", async () => {
  const { supabase } = setup({});

  await Promise.all([
    dispatchMetaEvent(supabase, "order-1", "purchase"),
    dispatchMetaEvent(supabase, "order-1", "purchase"),
  ]);

  assert.equal(pixelCalls().length, 1);
  assert.equal(datasetCalls().length, 1);
});

// 8 ─ The resend never calls the pixel.
function seedGap(db: FakeDb, count: number, purchasedAgoMs: number) {
  const purchasedAt = new Date(Date.now() - purchasedAgoMs).toISOString();
  for (let i = 0; i < count; i++) {
    const id = `gap-${i}`;
    db.seed("orders", [
      {
        ...db.find("orders", "order-1"),
        id,
        meta_purchase_sent: true,
        meta_purchase_dataset_sent: false,
        ordered_at: purchasedAt,
      },
    ]);
    db.seed("meta_event_log", [
      { event_type: "purchase", event_id: `purchase_${id}`, state: "success", created_at: purchasedAt },
    ]);
  }
}

test("dataset resend sends only to the dataset, with the real purchase time", async () => {
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 3, 2 * 86_400_000);

  const outcome = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });

  assert.equal(outcome.accepted, 3);
  assert.equal(pixelCalls().length, 0);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.destinationId, DATASET_ID);
    assert.equal(call.event.action_source, "business_messaging");
    const eventTime = Number(call.event.event_time) * 1000;
    assert.ok(Math.abs(eventTime - (Date.now() - 2 * 86_400_000)) < 5_000);
  }
  for (let i = 0; i < 3; i++) assert.equal(db.find("orders", `gap-${i}`)!.meta_purchase_dataset_sent, true);

  // Second run finds nothing: the flag is the guard.
  const again = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });
  assert.equal(again.eligible, 0);
  assert.equal(calls.length, 3);
});

test("dataset resend never calls the pixel, even when the dataset is not configured", async () => {
  delete process.env.META_WHATSAPP_DATASET_ID;
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 2, 86_400_000);

  const outcome = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });

  assert.equal(outcome.stoppedReason, "not_configured");
  assert.equal(calls.length, 0);
});

test("dataset resend dry run sends nothing", async () => {
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 2, 86_400_000);

  const outcome = await runDatasetResend(supabase, { dryRun: true });

  assert.equal(outcome.eligible, 2);
  assert.equal(calls.length, 0);
});

test("dataset resend aborts on the first 2804xxx rejection and never falls back to the pixel", async () => {
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 5, 86_400_000);
  responder = () => ({ status: 400, body: { error: { message: "no", error_subcode: 2804117 } } });

  const outcome = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });

  assert.equal(outcome.stoppedReason, "business_messaging_rejection");
  assert.equal(outcome.rejected, 1);
  assert.equal(outcome.firstSubcode, 2804117);
  assert.equal(calls.length, 1);
  assert.equal(pixelCalls().length, 0);
});

test("orders past the 6d12h window are counted as unrecoverable, never sent", async () => {
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 2, DATASET_RESEND_WINDOW_MS + 60 * 60 * 1000);

  const outcome = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });

  assert.equal(outcome.eligible, 0);
  assert.equal(outcome.expired, 2);
  assert.equal(calls.length, 0);
});

test("an order claimed by another run is skipped, not sent twice", async () => {
  const { db, supabase } = setup({ meta_purchase_sent: true, meta_purchase_dataset_sent: true });
  seedGap(db, 1, 86_400_000);
  db.find("orders", "gap-0")!.meta_dataset_resend_claimed_at = new Date().toISOString();

  const outcome = await runDatasetResend(supabase, { dryRun: false, delayMs: 0 });

  assert.equal(outcome.skipped, 1);
  assert.equal(calls.length, 0);
});
