import { test } from "node:test";
import assert from "node:assert/strict";

import { settlementPreview, signedAmount } from "../src/lib/treasury/calculations.ts";

test("settlement: agent keeps his fees — expected = collected − fees", () => {
  const p = settlementPreview({
    sales: [{ totalPrice: 1000, fee: 100 }, { totalPrice: 700, fee: 50 }],
    returns: [],
    agentKeepsFees: true,
    received: 1550,
  });
  assert.deepEqual(p, { collected: 1700, fees: 150, expectedNet: 1550, difference: 0 });
});

test("settlement: fees paid separately — expected = collected", () => {
  const p = settlementPreview({ sales: [{ totalPrice: 1000, fee: 100 }], returns: [], agentKeepsFees: false, received: 1000 });
  assert.equal(p.expectedNet, 1000);
  assert.equal(p.difference, 0);
});

test("settlement: returns only — expected is negative (the owner pays the agent)", () => {
  const p = settlementPreview({ sales: [], returns: [{ totalPrice: 0, fee: 30 }], agentKeepsFees: true, received: -30 });
  assert.deepEqual(p, { collected: 0, fees: 30, expectedNet: -30, difference: 0 });
});

test("settlement: difference is received − expected; missing fee counts as 0", () => {
  const p = settlementPreview({ sales: [{ totalPrice: 600, fee: null }], returns: [], agentKeepsFees: true, received: 580 });
  assert.equal(p.fees, 0);
  assert.equal(p.difference, -20);
});

test("settlement: no received amount yet → no difference shown", () => {
  assert.equal(settlementPreview({ sales: [{ totalPrice: 10, fee: 1 }], returns: [], agentKeepsFees: true, received: null }).difference, 0);
});

test("signedAmount follows the category direction", () => {
  assert.equal(signedAmount("income", -50), 50);
  assert.equal(signedAmount("expense", 50), -50);
  assert.equal(signedAmount("adjustment", -50), -50);
});
