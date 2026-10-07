import { test } from "node:test";
import assert from "node:assert/strict";

import {
  exceedsAvailable,
  landedUnitCosts,
  stockLevel,
  weightedAverageCost,
} from "../src/lib/inventory/calculations.ts";

test("landedUnitCosts spreads extra costs by line value (same rule as create_stock_purchase)", () => {
  // value 300 + 200 = 500; 100 extra -> 60 / 10 = +6 and 40 / 10 = +4
  assert.deepEqual(
    landedUnitCosts([{ quantity: 10, unitCost: 30 }, { quantity: 10, unitCost: 20 }], 100),
    [36, 24],
  );
});

test("landedUnitCosts with no extra costs is the unit cost", () => {
  assert.deepEqual(landedUnitCosts([{ quantity: 3, unitCost: 12.5 }], 0), [12.5]);
});

test("landedUnitCosts spreads by quantity when every line is free", () => {
  assert.deepEqual(landedUnitCosts([{ quantity: 1, unitCost: 0 }, { quantity: 3, unitCost: 0 }], 40), [10, 10]);
});

test("weightedAverageCost blends on-hand units at the current cost with the new ones", () => {
  // 10 at 400 + 10 at 300 -> 350
  assert.equal(weightedAverageCost({ onHandBefore: 10, currentCost: 400, receivedQty: 10, receivedUnitCost: 300 }), 350);
});

test("weightedAverageCost uses the new cost when nothing usable is on hand", () => {
  assert.equal(weightedAverageCost({ onHandBefore: 0, currentCost: 400, receivedQty: 5, receivedUnitCost: 300 }), 300);
  assert.equal(weightedAverageCost({ onHandBefore: -2, currentCost: 400, receivedQty: 5, receivedUnitCost: 300 }), 300);
  assert.equal(weightedAverageCost({ onHandBefore: 4, currentCost: null, receivedQty: 5, receivedUnitCost: 300 }), 300);
});

test("stockLevel: negative, low at/below the threshold, ok otherwise", () => {
  assert.equal(stockLevel(-1, 5), "negative");
  assert.equal(stockLevel(5, 5), "low");
  assert.equal(stockLevel(0, null), "ok");
  assert.equal(stockLevel(6, 5), "ok");
});

test("exceedsAvailable only warns when inventory is live", () => {
  assert.equal(exceedsAvailable(3, 2), true);
  assert.equal(exceedsAvailable(2, 2), false);
  assert.equal(exceedsAvailable(5, null), false);
});
