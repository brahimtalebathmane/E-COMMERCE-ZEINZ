/**
 * LeadSubmitted (WhatsApp dataset, once per click id) alongside the unchanged
 * Purchase. Meta's transport (fetch to graph.facebook.com) is mocked; every
 * assertion reads the requests actually made, in order. The real dispatcher and
 * the real status-change path run against the in-memory database.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  LEAD_SUBMITTED_RETRY_COOLDOWN_MS,
  retryLeadSubmittedBacklog,
  sendLeadSubmittedForOrder,
  sendLeadSubmittedSafely,
} from "../src/lib/meta/lead-submitted.ts";
import { dispatchMetaEvent } from "../src/lib/meta/dispatch.ts";
import { updateOrderStatusWithEffects } from "../src/lib/orders/update-status.ts";
import { FakeDb } from "./support/fake-supabase.ts";

const PIXEL_ID = "1111111111";
const DATASET_ID = "2222222222";
const WABA_ID = "3333333333";
const PIXEL_TOKEN = "pixel-token";
const WHATSAPP_TOKEN = "whatsapp-token";
const PHONE_E164 = "22236000000";

type MetaCall = {
  destinationId: string;
  accessToken: string | null;
  body: Record<string, unknown>;
  event: Record<string, unknown>;
};

let calls: MetaCall[] = [];
let responder: (call: MetaCall) => { status: number; body: unknown } = () => ({
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
  delete process.env.META_WHATSAPP_LEAD_SUBMITTED;
  delete process.env.META_CAPI_TEST_EVENT_CODE;
  delete process.env.ONESIGNAL_REST_API_KEY;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const match = url.hostname === "graph.facebook.com" && url.pathname.match(/\/([^/]+)\/events$/);
    if (!match) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body)) as { data: Record<string, unknown>[] };
    const call: MetaCall = {
      destinationId: match[1],
      accessToken: url.searchParams.get("access_token"),
      body,
      event: body.data[0],
    };
    calls.push(call);
    const { status, body: res } = responder(call);
    return new Response(JSON.stringify(res), { status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function baseOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "order-1",
    product_id: "prod-1",
    country_id: "country-mr",
    status: "pending",
    customer_name: "Ahmed Salem",
    phone: `+${PHONE_E164}`,
    total_price: 4000,
    currency: "MRU",
    quantity: 1,
    source: "manual",
    manual_sale_channel: "whatsapp",
    manual_sale_group_id: null,
    meta_ctwa_clid: "clid-abc",
    meta_ad_source_id: null,
    meta_fbp: null,
    meta_fbc: null,
    meta_lead_sent: false,
    meta_purchase_sent: false,
    meta_purchase_dataset_sent: false,
    meta_cancel_sent: false,
    meta_dataset_last_error: null,
    meta_dataset_resend_claimed_at: null,
    ordered_at: iso(HOUR),
    created_at: iso(HOUR),
    deleted_at: null,
    ...overrides,
  };
}

function setup(orders: Record<string, unknown>[] = [baseOrder()], click?: { clid: string; clickedAgoMs: number } | null) {
  const db = new FakeDb();
  db.seed("countries", [
    { id: "country-mr", iso_code: "MR", has_local_operations: true },
    { id: "country-sa", iso_code: "SA", has_local_operations: false },
  ]);
  db.seed("products", [
    { id: "prod-1", name_ar: "منتج", name_fr: "Produit", default_language: "ar", slug: "produit", country_id: null },
  ]);
  db.seed("orders", orders);
  const c = click === undefined ? { clid: "clid-abc", clickedAgoMs: 2 * HOUR } : click;
  if (c) {
    db.seed("whatsapp_contacts", [
      { phone: PHONE_E164, last_ctwa_clid: c.clid, last_ad_source_id: "ad-1", last_ad_clicked_at: iso(c.clickedAgoMs) },
    ]);
    db.seed("whatsapp_ad_clicks", [{ phone: PHONE_E164, ctwa_clid: c.clid, clicked_at: iso(c.clickedAgoMs) }]);
  }
  db.onRpc("change_order_status", (args, fake) => {
    const order = fake.find("orders", String(args.p_order_id));
    if (!order || order.deleted_at) throw new Error(`order_not_found: ${args.p_order_id}`);
    if (order.status !== args.p_from) throw new Error(`status_conflict`);
    order.status = args.p_to;
    return args.p_to;
  });
  return { db, supabase: db.client() };
}

const leadCalls = () => calls.filter((c) => c.event.event_name === "LeadSubmitted");
const purchaseCalls = () => calls.filter((c) => c.event.event_name === "Purchase");
const flushLogs = () => new Promise((resolve) => setTimeout(resolve, 20));
const logRows = (db: FakeDb) => db.rows("meta_event_log").filter((r) => r.event_type === "lead_submitted");

// ── Shape ──────────────────────────────────────────────────────────────────────
test("LeadSubmitted goes to the WhatsApp dataset only, business_messaging shape, no value or currency", async () => {
  const { db, supabase } = setup();

  const result = await sendLeadSubmittedForOrder(supabase, "order-1");

  assert.equal(result.state, "sent");
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.destinationId, DATASET_ID, "never the website pixel");
  assert.equal(call.accessToken, WHATSAPP_TOKEN);
  assert.equal(call.event.event_name, "LeadSubmitted");
  assert.equal(call.event.event_id, "leadsubmitted_order-1");
  assert.equal(call.event.action_source, "business_messaging");
  assert.equal(call.event.messaging_channel, "whatsapp");
  assert.equal(call.event.custom_data, undefined, "no value, no currency");
  assert.equal(call.event.event_source_url, undefined);
  const userData = call.event.user_data as Record<string, unknown>;
  assert.equal(userData.ctwa_clid, "clid-abc");
  assert.equal(userData.whatsapp_business_account_id, WABA_ID);
  // event_time is when the order was recorded.
  const created = Math.floor(Date.parse(String(db.find("orders", "order-1")!.created_at)) / 1000);
  assert.equal(call.event.event_time, created);

  const ledger = db.rows("meta_lead_submitted");
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].state, "sent");
  assert.equal(ledger[0].ctwa_clid, "clid-abc");

  await flushLogs();
  assert.deepEqual(logRows(db).map((r) => r.state), ["success"]);
});

// ── 1. One event per click id ──────────────────────────────────────────────────
test("one LeadSubmitted per click id: repeat calls and a second order from the same click send nothing", async () => {
  const { supabase } = setup([
    baseOrder(),
    baseOrder({ id: "order-2", created_at: iso(HOUR / 2), ordered_at: iso(HOUR / 2) }),
  ]);

  assert.equal((await sendLeadSubmittedForOrder(supabase, "order-1")).state, "sent");
  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "order-1"), { state: "skipped", reason: "already_sent" });
  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "order-2"), { state: "skipped", reason: "already_sent" });
  assert.equal(leadCalls().length, 1);
});

test("two admins / a retry at the same moment: exactly one request reaches Meta", async () => {
  const { db, supabase } = setup();

  const results = await Promise.all([
    sendLeadSubmittedSafely(supabase, "order-1"),
    sendLeadSubmittedSafely(supabase, "order-1"),
    sendLeadSubmittedSafely(supabase, "order-1"),
  ]);

  assert.equal(leadCalls().length, 1);
  assert.equal(results.filter((r) => r.state === "sent").length, 1);
  assert.equal(db.rows("meta_lead_submitted").length, 1);
});

// ── 2. Multi-line sale ─────────────────────────────────────────────────────────
test("a multi-line sale is one event, named after its first line, whichever line triggers it", async () => {
  const group = "group-1";
  const { supabase } = setup([
    baseOrder({ id: "line-a", manual_sale_group_id: group, created_at: iso(HOUR) }),
    baseOrder({ id: "line-b", manual_sale_group_id: group, created_at: iso(HOUR - 5) }),
  ]);

  const first = await sendLeadSubmittedForOrder(supabase, "line-b");
  const second = await sendLeadSubmittedForOrder(supabase, "line-a");

  assert.equal(first.state, "sent");
  assert.deepEqual(second, { state: "skipped", reason: "already_sent" });
  assert.equal(leadCalls().length, 1);
  assert.equal(leadCalls()[0].event.event_id, "leadsubmitted_line-a");
});

test("confirming every line of a multi-line sale sends one LeadSubmitted and one Purchase per line", async () => {
  const group = "group-1";
  const { supabase } = setup([
    baseOrder({ id: "line-a", manual_sale_group_id: group, created_at: iso(HOUR) }),
    baseOrder({ id: "line-b", manual_sale_group_id: group, created_at: iso(HOUR - 5) }),
  ]);

  await sendLeadSubmittedSafely(supabase, "line-a"); // at creation
  await updateOrderStatusWithEffects(supabase, "line-a", "confirmed");
  await updateOrderStatusWithEffects(supabase, "line-b", "confirmed");

  assert.equal(leadCalls().length, 1);
  assert.equal(purchaseCalls().length, 4, "pixel + dataset leg for each of the two lines");
});

// ── 3. Created confirmed: LeadSubmitted then Purchase ─────────────────────────
test("a sale recorded already confirmed sends LeadSubmitted first, then the Purchase", async () => {
  const { supabase } = setup();

  // createWhatsAppSaleAction: rows inserted pending → LeadSubmitted → confirm.
  await sendLeadSubmittedSafely(supabase, "order-1");
  const change = await updateOrderStatusWithEffects(supabase, "order-1", "confirmed");

  assert.equal(change.ok, true);
  assert.deepEqual(
    calls.map((c) => `${c.event.event_name}@${c.destinationId}`),
    [`LeadSubmitted@${DATASET_ID}`, `Purchase@${PIXEL_ID}`, `Purchase@${DATASET_ID}`],
  );
  assert.ok(Number(calls[0].event.event_time) <= Number(calls[1].event.event_time));
});

// ── 4. Late click id ───────────────────────────────────────────────────────────
function lateClickSetup() {
  // Recorded with no click id and no captured referral yet.
  const ctx = setup([baseOrder({ meta_ctwa_clid: null })], null);
  return {
    ...ctx,
    captureClick: () => {
      ctx.db.seed("whatsapp_contacts", [
        { phone: PHONE_E164, last_ctwa_clid: "clid-late", last_ad_source_id: "ad-1", last_ad_clicked_at: iso(HOUR + 60_000) },
      ]);
      ctx.db.seed("whatsapp_ad_clicks", [{ phone: PHONE_E164, ctwa_clid: "clid-late", clicked_at: iso(HOUR + 60_000) }]);
    },
  };
}

test("late click id found at confirm: LeadSubmitted is sent then, before the Purchase", async () => {
  const { supabase, captureClick } = lateClickSetup();

  assert.deepEqual(await sendLeadSubmittedSafely(supabase, "order-1"), { state: "skipped", reason: "no_click_id" });
  assert.equal(calls.length, 0);

  captureClick();
  await updateOrderStatusWithEffects(supabase, "order-1", "confirmed");

  assert.equal(calls[0].event.event_name, "LeadSubmitted");
  assert.equal((calls[0].event.user_data as Record<string, unknown>).ctwa_clid, "clid-late");
  assert.deepEqual(
    calls.slice(1).map((c) => `${c.event.event_name}@${c.destinationId}`),
    [`Purchase@${PIXEL_ID}`, `Purchase@${DATASET_ID}`],
  );
});

test("late click id found at cancel: the refused order is counted, and the order row is left as it was", async () => {
  const { db, supabase, captureClick } = lateClickSetup();

  await sendLeadSubmittedSafely(supabase, "order-1");
  captureClick();
  const change = await updateOrderStatusWithEffects(supabase, "order-1", "cancelled");

  assert.equal(change.ok, true);
  assert.deepEqual(
    calls.map((c) => `${c.event.event_name}@${c.destinationId}`),
    [`LeadSubmitted@${DATASET_ID}`, `CancelledLead@${PIXEL_ID}`],
  );
  assert.equal(db.find("orders", "order-1")!.meta_ctwa_clid, null, "cancel path writes nothing on the order");
  assert.equal(db.rows("meta_lead_submitted")[0].ctwa_clid, "clid-late");
});

// ── 5. Window ──────────────────────────────────────────────────────────────────
test("a click older than 7 days before the order sends nothing", async () => {
  const { db, supabase } = setup([baseOrder()], { clid: "clid-abc", clickedAgoMs: 8 * 24 * HOUR });

  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "order-1"), {
    state: "skipped",
    reason: "click_not_attributable",
  });
  assert.equal(calls.length, 0);
  assert.equal(db.rows("meta_lead_submitted").length, 0);
});

test("a click made well after the order (a new conversation) is not credited with it", async () => {
  const { supabase } = setup([baseOrder({ meta_ctwa_clid: null, created_at: iso(5 * HOUR) })], {
    clid: "clid-new",
    clickedAgoMs: HOUR,
  });

  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "order-1"), {
    state: "skipped",
    reason: "click_not_attributable",
  });
  assert.equal(calls.length, 0);
});

// ── 6. Dataset not configured ──────────────────────────────────────────────────
test("dataset not configured: no LeadSubmitted, and the Purchase is exactly as before", async () => {
  delete process.env.META_WHATSAPP_DATASET_ID;
  const { db, supabase } = setup();

  assert.deepEqual(await sendLeadSubmittedSafely(supabase, "order-1"), {
    state: "skipped",
    reason: "dataset_not_configured",
  });
  await updateOrderStatusWithEffects(supabase, "order-1", "confirmed");

  assert.equal(leadCalls().length, 0);
  assert.deepEqual(calls.map((c) => `${c.event.event_name}@${c.destinationId}`), [`Purchase@${PIXEL_ID}`]);
  assert.equal(db.rows("meta_lead_submitted").length, 0);
});

// ── 7. Switch ──────────────────────────────────────────────────────────────────
test("META_WHATSAPP_LEAD_SUBMITTED=off sends nothing and leaves Purchase alone", async () => {
  process.env.META_WHATSAPP_LEAD_SUBMITTED = "off";
  const { db, supabase } = setup();

  assert.deepEqual(await sendLeadSubmittedSafely(supabase, "order-1"), { state: "skipped", reason: "disabled" });
  await updateOrderStatusWithEffects(supabase, "order-1", "confirmed");

  assert.equal(leadCalls().length, 0);
  assert.equal(purchaseCalls().length, 2);
  assert.equal(db.rows("meta_lead_submitted").length, 0);
});

test("a malformed switch value keeps LeadSubmitted on", async () => {
  process.env.META_WHATSAPP_LEAD_SUBMITTED = "disabled";
  const { supabase } = setup();
  assert.equal((await sendLeadSubmittedSafely(supabase, "order-1")).state, "sent");
});

// ── 8. Failure isolation ──────────────────────────────────────────────────────
test("a rejected LeadSubmitted leaves the sale and its Purchase intact, is logged, and can be retried once", async () => {
  const { db, supabase } = setup();
  responder = (call) =>
    call.event.event_name === "LeadSubmitted"
      ? { status: 400, body: { error: { message: "bad", error_subcode: 2804117 } } }
      : { status: 200, body: { events_received: 1 } };

  const lead = await sendLeadSubmittedSafely(supabase, "order-1");
  const change = await updateOrderStatusWithEffects(supabase, "order-1", "confirmed");

  assert.deepEqual(lead, { state: "failed", reason: "http_error" });
  assert.equal(change.ok, true);
  assert.deepEqual(change.ok && change.metaPurchase, { state: "sent" });
  assert.equal(db.find("orders", "order-1")!.status, "confirmed");
  assert.equal(db.find("orders", "order-1")!.meta_purchase_sent, true);
  assert.equal(db.find("orders", "order-1")!.meta_purchase_dataset_sent, true);
  assert.equal(leadCalls().length, 1, "the confirm right after does not hammer Meta again (cooldown)");

  const row = db.rows("meta_lead_submitted")[0];
  assert.equal(row.state, "failed");
  assert.match(String(row.last_error), /http_error subcode=2804117/);
  await flushLogs();
  assert.ok(logRows(db).some((r) => r.state === "failed" && r.reason === "http_error"));

  // Retry from /admin/meta once the cooldown has passed.
  row.claimed_at = new Date(Date.now() - LEAD_SUBMITTED_RETRY_COOLDOWN_MS - 1000).toISOString();
  responder = () => ({ status: 200, body: { events_received: 1 } });
  const retry = await retryLeadSubmittedBacklog(supabase);
  const again = await retryLeadSubmittedBacklog(supabase);

  assert.deepEqual(retry, { attempted: 1, sent: 1, failed: 0, skipped: 0 });
  assert.deepEqual(again, { attempted: 0, sent: 0, failed: 0, skipped: 0 });
  assert.equal(leadCalls().length, 2);
  assert.equal(leadCalls()[1].event.event_id, leadCalls()[0].event.event_id, "retry reuses the event id");
  assert.equal(db.rows("meta_lead_submitted")[0].attempt_count, 2);
});

test("a database error inside LeadSubmitted never reaches the sale or the Purchase", async () => {
  const { db, supabase } = setup();
  const broken = {
    ...supabase,
    from: (table: string) => {
      if (table === "meta_lead_submitted") throw new Error("ledger unavailable");
      return supabase.from(table);
    },
    rpc: supabase.rpc,
  } as typeof supabase;

  const lead = await sendLeadSubmittedSafely(broken, "order-1");
  const change = await updateOrderStatusWithEffects(broken, "order-1", "confirmed");

  assert.deepEqual(lead, { state: "failed", reason: "exception" });
  assert.equal(change.ok, true);
  assert.deepEqual(change.ok && change.metaPurchase, { state: "sent" });
  assert.equal(purchaseCalls().length, 2);
  assert.equal(db.find("orders", "order-1")!.status, "confirmed");
});

// ── 9. Scope ───────────────────────────────────────────────────────────────────
test("storefront orders and non-local-operations (SA/KW) orders never send LeadSubmitted", async () => {
  const { supabase } = setup([
    baseOrder({ id: "storefront", source: "storefront", manual_sale_channel: null }),
    baseOrder({ id: "sa-sale", country_id: "country-sa" }),
  ]);

  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "storefront"), {
    state: "skipped",
    reason: "not_whatsapp_sale",
  });
  assert.deepEqual(await sendLeadSubmittedForOrder(supabase, "sa-sale"), {
    state: "skipped",
    reason: "not_local_operations",
  });
  await updateOrderStatusWithEffects(supabase, "storefront", "confirmed");
  assert.equal(leadCalls().length, 0);
});

// ── 10. Purchase payload unchanged ─────────────────────────────────────────────
/**
 * The Purchase requests of an attributable WhatsApp sale, as produced by the
 * dispatcher before LeadSubmitted existed (src/lib/meta/dispatch.ts is not
 * modified by this change). Captured by running main at 9b309ee in a scratch
 * worktree. Only event_time varies between runs.
 */
const EXPECTED_PURCHASE_REQUESTS =
  "[{\"destinationId\":\"1111111111\",\"accessToken\":\"pixel-token\",\"body\":{\"data\":[{\"event_name\":\"Purchase\",\"event_id\":\"purchase_order-1\",\"action_source\":\"chat\",\"user_data\":{\"country\":[\"79032b8a85663acddd601fd25371b7cb91f3ee6fbe68215f3cf6d4736bcbeea9\"],\"fn\":[\"9af2921d3fd57fe886c9022d1fcc055d53a79e4032fa6137e397583884e1a5de\"],\"ln\":[\"7f3806e77be78814aa3da52f05dd518b0d236c919504fee6c9f5b839f52cbffc\"],\"ph\":[\"93ac8e888631731ee0f2482521dd508ee21c24b1a2736605df9addd9b8d772de\"],\"external_id\":[\"05f2cae462c192b36dd56268692c35e51ce3e3fb14215c9b173b816defcebfbf\"]},\"custom_data\":{\"value\":104,\"currency\":\"USD\",\"content_type\":\"product\",\"content_ids\":[\"prod-1\"],\"content_name\":\"منتج\",\"contents\":[{\"id\":\"prod-1\",\"quantity\":1}]}}]}},{\"destinationId\":\"2222222222\",\"accessToken\":\"whatsapp-token\",\"body\":{\"data\":[{\"event_name\":\"Purchase\",\"event_id\":\"purchase_order-1\",\"action_source\":\"business_messaging\",\"user_data\":{\"ctwa_clid\":\"clid-abc\",\"whatsapp_business_account_id\":\"3333333333\",\"country\":[\"79032b8a85663acddd601fd25371b7cb91f3ee6fbe68215f3cf6d4736bcbeea9\"],\"fn\":[\"9af2921d3fd57fe886c9022d1fcc055d53a79e4032fa6137e397583884e1a5de\"],\"ln\":[\"7f3806e77be78814aa3da52f05dd518b0d236c919504fee6c9f5b839f52cbffc\"],\"ph\":[\"93ac8e888631731ee0f2482521dd508ee21c24b1a2736605df9addd9b8d772de\"],\"external_id\":[\"05f2cae462c192b36dd56268692c35e51ce3e3fb14215c9b173b816defcebfbf\"]},\"custom_data\":{\"value\":104,\"currency\":\"USD\",\"content_type\":\"product\",\"content_ids\":[\"prod-1\"],\"content_name\":\"منتج\",\"contents\":[{\"id\":\"prod-1\",\"quantity\":1}]},\"messaging_channel\":\"whatsapp\"}]}}]";

function purchaseRequestsWithoutTime(): unknown {
  return purchaseCalls().map((c) => ({
    destinationId: c.destinationId,
    accessToken: c.accessToken,
    body: {
      ...c.body,
      data: (c.body.data as Record<string, unknown>[]).map(({ event_time: _t, ...rest }) => rest),
    },
  }));
}

test("the Purchase payload is byte-for-byte what it was before, whether LeadSubmitted ran or not", async () => {
  const withLead = setup();
  await sendLeadSubmittedSafely(withLead.supabase, "order-1");
  await updateOrderStatusWithEffects(withLead.supabase, "order-1", "confirmed");
  const on = purchaseRequestsWithoutTime();

  calls = [];
  process.env.META_WHATSAPP_LEAD_SUBMITTED = "off";
  const withoutLead = setup();
  // Purchase dispatch alone, LeadSubmitted switched off.
  withoutLead.db.find("orders", "order-1")!.status = "confirmed";
  await dispatchMetaEvent(withoutLead.supabase, "order-1", "purchase", {});
  const off = purchaseRequestsWithoutTime();

  assert.equal(JSON.stringify(on), JSON.stringify(off));
  assert.equal(JSON.stringify(on), EXPECTED_PURCHASE_REQUESTS);
});
