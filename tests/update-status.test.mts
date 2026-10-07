/**
 * updateOrderStatusWithEffects after Phase B: the change goes through the
 * change_order_status database function (compare-and-set + history + stock),
 * and Meta events are sent only after it succeeds — exactly as before.
 */
import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import { FakeDb } from "./support/fake-supabase.ts";

const src = (path: string) => new URL(`../src/${path}`, import.meta.url).href;

const metaCalls: Array<{ orderId: string; eventType: string }> = [];
type UpdateFn = typeof import("../src/lib/orders/update-status.ts").updateOrderStatusWithEffects;
let updateOrderStatusWithEffects: UpdateFn;

before(async () => {
  mock.module(src("lib/meta/dispatch.ts"), {
    namedExports: {
      dispatchMetaEvent: async (_supabase: unknown, orderId: string, eventType: string) => {
        metaCalls.push({ orderId, eventType });
        return { sent: true };
      },
    },
  });
  ({ updateOrderStatusWithEffects } = await import(src("lib/orders/update-status.ts")));
});

let db: FakeDb;
const ORDER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db = new FakeDb();
  metaCalls.length = 0;
  db.seed("orders", [{ id: ORDER, status: "pending", deleted_at: null }]);
  // Behaves like migration 072: compare-and-set on the previous status.
  db.onRpc("change_order_status", (args, fake) => {
    const order = fake.find("orders", String(args.p_order_id));
    if (!order || order.deleted_at) throw new Error(`order_not_found: ${args.p_order_id}`);
    if (order.status !== args.p_from) throw new Error(`status_conflict: order is no longer ${args.p_from}`);
    order.status = args.p_to;
    return args.p_to;
  });
});

test("confirming goes through change_order_status, then sends Purchase", async () => {
  const res = await updateOrderStatusWithEffects(db.client(), ORDER, "confirmed", { changedBy: "user-1" });
  assert.equal(res.ok, true);
  assert.deepEqual(db.rpcCalls, [
    {
      name: "change_order_status",
      args: { p_order_id: ORDER, p_from: "pending", p_to: "confirmed", p_changed_by: "user-1", p_return_disposition: null },
    },
  ]);
  assert.deepEqual(metaCalls, [{ orderId: ORDER, eventType: "purchase" }]);
});

test("a concurrent change (status moved meanwhile) is a conflict and sends nothing", async () => {
  db.onRpc("change_order_status", () => {
    throw new Error("status_conflict: order is no longer pending");
  });
  const res = await updateOrderStatusWithEffects(db.client(), ORDER, "confirmed");
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.code, "conflict");
  assert.equal(metaCalls.length, 0);
});

test("invalid transitions never reach the database", async () => {
  const res = await updateOrderStatusWithEffects(db.client(), ORDER, "shipped");
  assert.equal(res.ok === false && res.code, "invalid_transition");
  assert.equal(db.rpcCalls.length, 0);
});

test("same status is a no-op", async () => {
  const res = await updateOrderStatusWithEffects(db.client(), ORDER, "pending");
  assert.equal(res.ok && res.unchanged, true);
  assert.equal(db.rpcCalls.length, 0);
});

test("return disposition is passed only for internal_return", async () => {
  db.find("orders", ORDER)!.status = "shipped";
  await updateOrderStatusWithEffects(db.client(), ORDER, "internal_return", { returnDisposition: "damaged" });
  assert.equal(db.rpcCalls[0].args.p_return_disposition, "damaged");
  assert.equal(metaCalls.length, 0, "internal_return sends no Meta event");

  db.find("orders", ORDER)!.status = "pending";
  await updateOrderStatusWithEffects(db.client(), ORDER, "cancelled", { returnDisposition: "damaged" });
  assert.equal(db.rpcCalls[1].args.p_return_disposition, null);
  assert.deepEqual(metaCalls, [{ orderId: ORDER, eventType: "cancel" }]);
});

test("deleted orders are not found and never changed", async () => {
  db.find("orders", ORDER)!.deleted_at = new Date().toISOString();
  const res = await updateOrderStatusWithEffects(db.client(), ORDER, "confirmed");
  assert.equal(res.ok === false && res.code, "not_found");
  assert.equal(db.rpcCalls.length, 0);
});
