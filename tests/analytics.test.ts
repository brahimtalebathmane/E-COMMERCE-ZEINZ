import { test } from "node:test";
import assert from "node:assert/strict";

import { dedupeAdSpendDaily, elapsedDaysInMonth } from "../src/lib/analytics/period.ts";
import { moneySign, bucketWeekly, type DailyProductProfit } from "../src/lib/analytics/daily-profit.ts";
import {
  buildProductProfitRows,
  isAdSpendOnOrAfterStartDate,
  sumProfitTotals,
  type ProductMeta,
  type ProfitOrderInput,
} from "../src/lib/analytics/profit.ts";

test("dedupeAdSpendDaily: later rows win on (product_id, date) collision", () => {
  const rows = [
    { product_id: "p1", date: "2026-08-01", amount: 1000 },
    { product_id: "p1", date: "2026-08-02", amount: 1000 },
    // A revisit re-syncs the same day with a fresher amount — later wins.
    { product_id: "p1", date: "2026-08-01", amount: 1500 },
  ];
  const deduped = dedupeAdSpendDaily(rows);
  assert.equal(deduped.length, 2);
  const day1 = deduped.find((r) => r.date === "2026-08-01");
  assert.equal(day1?.amount, 1500);
});

test("isAdSpendOnOrAfterStartDate: before / on / after cutoff, and malformed input", () => {
  assert.equal(isAdSpendOnOrAfterStartDate("2026-05-31", "2026-06-01"), false); // before
  assert.equal(isAdSpendOnOrAfterStartDate("2026-06-01", "2026-06-01"), true); // on cutoff (inclusive)
  assert.equal(isAdSpendOnOrAfterStartDate("2026-06-02", "2026-06-01"), true); // after
  assert.equal(isAdSpendOnOrAfterStartDate("2026-06-02", null), true); // no cutoff
  assert.equal(isAdSpendOnOrAfterStartDate("2026-06-02", "not-a-date"), true); // malformed cutoff never drops
  assert.equal(isAdSpendOnOrAfterStartDate("not-a-date", "2026-06-01"), true); // malformed date never drops
});

test("buildProductProfitRows: affiliate set_price order with quantity=3 (A8)", () => {
  const orders: ProfitOrderInput[] = [
    {
      product_id: "aff1",
      total_price: 0,
      status: "shipped",
      ordered_at: "2026-08-05T00:00:00Z",
      quantity: 3,
      affiliate_other_costs: 2,
      affiliate_costs_finalized: true,
      unit_cost_price: 15,
      affiliate_commission_type_at_order: "set_price",
      affiliate_sell_price_at_order: 25,
    },
  ];
  const products = new Map<string, ProductMeta>([
    [
      "aff1",
      {
        name: "منتج تابع",
        costPrice: 15,
        fulfillmentType: "affiliate",
        affiliateCommissionType: "set_price",
        affiliateSellPrice: 25,
        currency: "KWD",
      },
    ],
  ]);
  const rows = buildProductProfitRows({ orders, products, adSpendDaily: [] });
  assert.equal(rows.length, 1);
  const row = rows[0];
  // 3*25 - 3*15 - 2 = 28, NOT 25 - 45 - 2 = -22
  assert.equal(row.grossRevenue, 75);
  assert.equal(row.cogs, 45);
  assert.equal(row.otherCosts, 2);
  assert.equal(row.grossRevenue - (row.cogs + row.deliveryCost + row.otherCosts + row.adSpend), 28);
});

test("sumProfitTotals: productsMissingCost / revenueMissingCost populate for a hasCost:false row with revenue", () => {
  const rows = [
    {
      productId: "p1",
      name: "P1",
      fulfillmentType: "owned" as const,
      currency: "MRU",
      costPrice: 0,
      unitsSold: 1,
      ordersCount: 1,
      grossRevenue: 2000,
      cogs: 0,
      deliveryCost: 0,
      otherCosts: 0,
      adSpend: 0,
      internalReturns: 0,
      awaitingCosts: 0,
      hasCost: false,
      calculationStartDate: null,
      misconfigured: 0,
      adSpendUnavailable: false,
    },
  ];
  const totals = sumProfitTotals(rows);
  assert.equal(totals.productsMissingCost, 1);
  assert.equal(totals.revenueMissingCost, 2000);
});

test("sumProfitTotals: a product with hasCost:true never counts as missing", () => {
  const rows = [
    {
      productId: "p1",
      name: "P1",
      fulfillmentType: "owned" as const,
      currency: "MRU",
      costPrice: 100,
      unitsSold: 1,
      ordersCount: 1,
      grossRevenue: 2000,
      cogs: 100,
      deliveryCost: 0,
      otherCosts: 0,
      adSpend: 0,
      internalReturns: 0,
      awaitingCosts: 0,
      hasCost: true,
      calculationStartDate: null,
      misconfigured: 0,
      adSpendUnavailable: false,
    },
  ];
  const totals = sumProfitTotals(rows);
  assert.equal(totals.productsMissingCost, 0);
  assert.equal(totals.revenueMissingCost, 0);
});

test("moneySign: the A15 float-residue scenario returns 0, not -1", () => {
  const revenue = 3 * 1999.99;
  const cogs = 3 * 1333.33;
  const delivery = 3 * 200;
  const adSpend = 1399.98;
  const netProfitValue = revenue - (cogs + delivery + adSpend);
  // ~9.09e-13 — float residue from subtracting rounded amounts, not a real loss.
  assert.equal(moneySign(netProfitValue), 0);
  assert.equal(moneySign(1), 1);
  assert.equal(moneySign(-1), -1);
  assert.equal(moneySign(0.001), 0); // below the epsilon
  assert.equal(moneySign(-0.001), 0);
});

test("elapsedDaysInMonth: mid-month, month end, a past month, a future month", () => {
  assert.equal(elapsedDaysInMonth("2026-09", "2026-09-15"), 15); // mid-month
  assert.equal(elapsedDaysInMonth("2026-09", "2026-09-30"), 30); // month end
  assert.equal(elapsedDaysInMonth("2026-08", "2026-09-15"), 31); // past month -> full length
  assert.equal(elapsedDaysInMonth("2026-10", "2026-09-15"), 0); // future month -> hasn't started
});

test("bucketWeekly: sparse series (one active day per week for 14 weeks) yields 14 buckets, each 7 calendar days", () => {
  const daily: DailyProductProfit[] = [];
  // One row every 7 calendar days, starting 2026-01-05, for 14 weeks.
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 0, 5 + i * 7));
    const dateKey = d.toISOString().slice(0, 10);
    daily.push({
      date: dateKey,
      productId: "p1",
      revenue: 10000,
      cogs: 0,
      deliveryCost: 0,
      adSpend: 0,
      netProfit: 10000,
    });
  }
  const combined = daily.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    cogs: d.cogs,
    deliveryCost: d.deliveryCost,
    adSpend: d.adSpend,
    netProfit: d.netProfit,
  }));
  const buckets = bucketWeekly(combined, "weekly");
  assert.equal(buckets.length, 14);
  for (const bucket of buckets) {
    // Exactly 7 calendar days per bucket (not "however many rows it takes to find 7").
    const start = new Date(`${bucket.startDate}T00:00:00Z`).getTime();
    const end = new Date(`${bucket.endDate}T00:00:00Z`).getTime();
    assert.equal((end - start) / (24 * 60 * 60 * 1000), 6);
  }
  // Each bucket holds exactly the one active day's revenue — not 7 days' worth
  // of a wrongly-row-counted chunk.
  for (const bucket of buckets) {
    assert.equal(bucket.revenue, 10000);
  }
});
