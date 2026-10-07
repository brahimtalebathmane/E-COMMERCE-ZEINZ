import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_ORDER_FILTERS,
  chunkIds,
  hasServerFilters,
  matchesOrderListFilters,
  orderDateBounds,
  parseOrderListFilters,
  serializeOrderListFilters,
  summarizeOrders,
} from "../src/lib/orders/list-filters.ts";

const PRODUCT = "11111111-2222-4333-8444-555555555555";

test("parse: valid values kept in canonical order, junk ignored", () => {
  const f = parseOrderListFilters({
    status: "shipped,pending,nope",
    from: "2026-10-01",
    to: "2026-09-01", // swapped
    older: "30",
    product: PRODUCT,
    source: "manual",
    q: "ahmed",
  });
  assert.deepEqual(f, {
    statuses: ["pending", "shipped"],
    from: "2026-09-01",
    to: "2026-10-01",
    olderThanDays: 30,
    productId: PRODUCT,
    source: "manual",
    q: "ahmed",
  });
  assert.deepEqual(parseOrderListFilters({ older: "45", product: "x", source: "web", from: "2026-13-45" }), EMPTY_ORDER_FILTERS);
});

test("serialize ↔ parse round-trip, and the text search is not a server filter", () => {
  const f = parseOrderListFilters(new URLSearchParams("status=cancelled,internal_return&older=7&source=storefront&q=22"));
  assert.equal(serializeOrderListFilters(f), "status=cancelled%2Cinternal_return&older=7&source=storefront&q=22");
  assert.deepEqual(parseOrderListFilters(new URLSearchParams(serializeOrderListFilters(f))), f);
  assert.equal(hasServerFilters({ ...EMPTY_ORDER_FILTERS, q: "x" }), false);
  assert.equal(hasServerFilters(f), true);
});

test("date bounds: to is inclusive, older-than tightens the upper bound", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.deepEqual(orderDateBounds({ ...EMPTY_ORDER_FILTERS, from: "2026-09-01", to: "2026-09-30" }, now), {
    gte: "2026-09-01T00:00:00.000Z",
    lt: "2026-10-01T00:00:00.000Z",
  });
  assert.deepEqual(orderDateBounds({ ...EMPTY_ORDER_FILTERS, olderThanDays: 7 }, now), {
    gte: null,
    lt: "2026-09-30T12:00:00.000Z",
  });
  assert.equal(orderDateBounds({ ...EMPTY_ORDER_FILTERS, to: "2026-10-05", olderThanDays: 30 }, now).lt, "2026-09-07T12:00:00.000Z");
});

test("matches: same rules as the server query", () => {
  const f = { ...EMPTY_ORDER_FILTERS, statuses: ["confirmed" as const], productId: PRODUCT, source: "manual" as const };
  const bounds = orderDateBounds({ ...f, olderThanDays: 30 }, new Date("2026-10-07T00:00:00Z"));
  const row = { status: "confirmed" as const, product_id: PRODUCT, source: "manual", ordered_at: "2026-08-01T10:00:00Z" };
  assert.equal(matchesOrderListFilters(row, f, bounds), true);
  assert.equal(matchesOrderListFilters({ ...row, status: "shipped" }, f, bounds), false);
  assert.equal(matchesOrderListFilters({ ...row, source: "storefront" }, f, bounds), false);
  assert.equal(matchesOrderListFilters({ ...row, ordered_at: "2026-10-01T00:00:00Z" }, f, bounds), false);
  assert.equal(matchesOrderListFilters(row, EMPTY_ORDER_FILTERS, { gte: null, lt: null }), true);
});

test("summary: count and one total per currency; chunks", () => {
  assert.deepEqual(
    summarizeOrders([
      { total_price: 1000, currency: "MRU" },
      { total_price: 250.5, currency: "mru" },
      { total_price: 30, currency: "SAR" },
    ]),
    { count: 3, totals: [{ currency: "MRU", amount: 1250.5 }, { currency: "SAR", amount: 30 }] },
  );
  assert.deepEqual(chunkIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
