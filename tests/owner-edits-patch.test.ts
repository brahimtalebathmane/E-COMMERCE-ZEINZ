import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeChanges,
  diffFields,
  sanitizeMovementPatch,
  sanitizeTransactionPatch,
} from "../src/lib/owner-edits/patch.ts";

const ID = "11111111-2222-4333-8444-555555555555";

test("transaction patch: keeps valid fields, rejects 0 and bad ids", () => {
  assert.deepEqual(sanitizeTransactionPatch({ amount: 125.004, note: "  x ", party_id: null }), {
    ok: true,
    patch: { amount: 125, note: "x", party_id: null },
  });
  assert.equal(sanitizeTransactionPatch({ amount: 0 }).ok, false);
  assert.equal(sanitizeTransactionPatch({ account_id: "nope" }).ok, false);
  assert.equal(sanitizeTransactionPatch({ occurred_on: "12/10/2026" }).ok, false);
  assert.equal(sanitizeTransactionPatch({ kind: "weird" as never }).ok, false);
  assert.deepEqual(sanitizeTransactionPatch({ order_id: ID, order_role: "sale" }), {
    ok: true,
    patch: { order_id: ID, order_role: "sale" },
  });
});

test("movement patch: integer non-zero quantity, known type, non-negative cost", () => {
  assert.deepEqual(sanitizeMovementPatch({ quantity: -2, type: "sale_out", date: "2026-10-12" }), {
    ok: true,
    patch: { quantity: -2, type: "sale_out", date: "2026-10-12" },
  });
  assert.equal(sanitizeMovementPatch({ quantity: 1.5 }).ok, false);
  assert.equal(sanitizeMovementPatch({ quantity: 0 }).ok, false);
  assert.equal(sanitizeMovementPatch({ unit_cost: -1 }).ok, false);
  assert.equal(sanitizeMovementPatch({ type: "gift" as never }).ok, false);
});

test("diff keeps only real changes; confirmation shows old → new", () => {
  const before = { amount: 100, note: "", account_id: "a" };
  const changes = diffFields(before, { amount: 125, note: "", account_id: "b" });
  assert.deepEqual(changes, { amount: 125, account_id: "b" });
  const names: Record<string, string> = { a: "الصندوق", b: "بنكيلي" };
  assert.deepEqual(
    describeChanges(before, changes, { amount: "المبلغ", account_id: "الحساب" }, (k, v) =>
      k === "account_id" ? names[String(v)] : String(v),
    ),
    [
      { label: "المبلغ", from: "100", to: "125" },
      { label: "الحساب", from: "الصندوق", to: "بنكيلي" },
    ],
  );
});

test("audit changes list only real field changes, without bookkeeping columns", async () => {
  const { auditChanges } = await import("../src/lib/owner-edits/patch.ts");
  assert.deepEqual(
    auditChanges({ id: "x", amount: -100, note: null, edited_at: null }, { id: "x", amount: -125, note: null, edited_at: "now" }),
    [{ key: "amount", from: "-100", to: "-125" }],
  );
  assert.deepEqual(auditChanges(null, { id: "y", quantity: 3 }), [{ key: "quantity", from: "—", to: "3" }]);
});
