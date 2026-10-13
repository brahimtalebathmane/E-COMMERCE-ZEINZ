/**
 * Owner edit actions: a staff session is refused before any database call;
 * the owner's call reaches the 076 function with the owner's id.
 * Requires `--experimental-test-module-mocks` (set in the npm test script).
 */
import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

const src = (path: string) => new URL(`../src/${path}`, import.meta.url).href;

class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let role: "owner" | "staff" = "staff";
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

type Actions = typeof import("../src/app/admin/(dashboard)/owner/actions.ts");
let actions: Actions;

before(async () => {
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
  mock.module(src("lib/auth/admin.ts"), {
    namedExports: {
      AuthError,
      assertOwnerUser: async () => {
        if (role !== "owner") throw new AuthError(403, "Owner access required");
        return { access: { userId: "owner-1", isOwner: true } };
      },
    },
  });
  mock.module(src("lib/auth/country-scope.ts"), {
    namedExports: { requireLocalOperationsScope: async () => ({ countryId: "mr" }) },
  });
  mock.module(src("lib/supabase/service.ts"), {
    namedExports: {
      createServiceClient: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });
          return { data: null, error: null };
        },
      }),
    },
  });
  actions = await import("../src/app/admin/(dashboard)/owner/actions.ts");
});

beforeEach(() => {
  rpcCalls.length = 0;
});

const ID = "11111111-2222-4333-8444-555555555555";

test("staff can't edit or delete anything", async () => {
  role = "staff";
  const results = await Promise.all([
    actions.ownerUpdateTransactionAction(ID, { amount: 125 }),
    actions.ownerSetTransactionDeletedAction(ID, true),
    actions.ownerUpdateMovementAction(ID, { quantity: 2 }),
    actions.ownerSetStockAction(ID, 5),
    actions.ownerResetOrderStockAction(ID),
    actions.ownerSetStockPurchaseDeletedAction(ID, true),
  ]);
  for (const r of results) assert.deepEqual(r, { ok: false, error: "هذا الإجراء للمالك فقط." });
  assert.equal(rpcCalls.length, 0, "no database call for staff");
});

test("the owner's edit reaches the database function with the owner's id and reason", async () => {
  role = "owner";
  const res = await actions.ownerUpdateTransactionAction(ID, { amount: 125 }, " typo ");
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(rpcCalls, [
    { fn: "owner_update_transaction", args: { p_id: ID, p_patch: { amount: 125 }, p_reason: "typo", p_user: "owner-1" } },
  ]);
});

test("invalid input is refused before the database", async () => {
  role = "owner";
  assert.equal((await actions.ownerUpdateTransactionAction(ID, { amount: 0 })).ok, false);
  assert.equal((await actions.ownerSetStockAction(ID, 1.5)).ok, false);
  assert.equal(rpcCalls.length, 0);
});
