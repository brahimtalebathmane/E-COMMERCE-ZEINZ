import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bucketCash,
  buildBridge,
  clipToTreasury,
  splitRevenue,
  summarizeOpex,
  unlinkedSales,
  type RecCategory,
  type RecTxn,
} from "../src/lib/treasury/reconciliation.ts";

const cats: RecCategory[] = [
  { id: "sales", parentId: null, name: "المبيعات", systemKey: "sales", countedInProfitBy: "orders" },
  { id: "fees", parentId: null, name: "رسوم التوصيل", systemKey: "delivery_fees", countedInProfitBy: "orders" },
  { id: "ads", parentId: null, name: "الإعلانات", systemKey: "ads", countedInProfitBy: "orders" },
  { id: "stock", parentId: null, name: "شراء بضاعة", systemKey: "stock_purchases", countedInProfitBy: "none" },
  { id: "withdraw", parentId: null, name: "سحب المالك", systemKey: "owner_withdrawals", countedInProfitBy: "none" },
  { id: "capital", parentId: null, name: "رأس المال", systemKey: "capital", countedInProfitBy: "none" },
  { id: "transfer", parentId: null, name: "تحويل", systemKey: "transfer", countedInProfitBy: "none" },
  { id: "opening", parentId: null, name: "رصيد افتتاحي", systemKey: "opening_balance", countedInProfitBy: "none" },
  { id: "rent", parentId: null, name: "الإيجار", systemKey: "rent", countedInProfitBy: "opex" },
  { id: "salaries", parentId: null, name: "الرواتب", systemKey: "salaries", countedInProfitBy: "opex" },
  { id: "salaries-ali", parentId: "salaries", name: "راتب علي", systemKey: null, countedInProfitBy: "opex" },
  { id: "cashdiff", parentId: null, name: "فرق الصندوق", systemKey: "cash_difference", countedInProfitBy: "opex" },
];

const range = { startKey: "2026-10-01", endKey: "2026-10-31" };

test("clipToTreasury: never before go-live, never after today", () => {
  assert.deepEqual(clipToTreasury({ kind: "all" }, "2026-10-05", "2026-10-20"), { startKey: "2026-10-05", endKey: "2026-10-20" });
  assert.deepEqual(clipToTreasury({ kind: "month", month: "2026-10" }, "2026-10-05", "2026-10-20"), {
    startKey: "2026-10-05",
    endKey: "2026-10-20",
  });
  assert.deepEqual(clipToTreasury({ kind: "month", month: "2026-09" }, "2026-08-10", "2026-10-20"), {
    startKey: "2026-09-01",
    endKey: "2026-09-30",
  });
  assert.equal(clipToTreasury({ kind: "month", month: "2026-09" }, "2026-10-05", "2026-10-20"), null);
});

test("opex: only opex categories, grouped by parent, reversals cancel, cash surplus lowers cost", () => {
  const txns: RecTxn[] = [
    { amount: -5000, categoryId: "rent", occurredOn: "2026-10-02" },
    { amount: -3000, categoryId: "salaries", occurredOn: "2026-10-03" },
    { amount: -2000, categoryId: "salaries-ali", occurredOn: "2026-10-04" },
    { amount: -400, categoryId: "rent", occurredOn: "2026-10-05" },
    { amount: 400, categoryId: "rent", occurredOn: "2026-10-06" }, // reversal of the line above
    { amount: 100, categoryId: "cashdiff", occurredOn: "2026-10-07" }, // surplus at a count
    { amount: -900, categoryId: "ads", occurredOn: "2026-10-07" }, // counted by orders → never opex
    { amount: -700, categoryId: "stock", occurredOn: "2026-10-07" },
    { amount: -9999, categoryId: "rent", occurredOn: "2026-09-30" }, // outside the range
  ];
  const s = summarizeOpex(txns, cats, range);
  assert.equal(s.total, 9900);
  assert.deepEqual(
    s.byCategory.map((l) => [l.categoryId, l.amount]),
    [
      ["rent", 5000],
      ["salaries", 5000],
      ["cashdiff", -100],
    ],
  );
  assert.deepEqual(summarizeOpex(txns, cats, null), { total: 0, byCategory: [] });
});

test("bucketCash ignores transfers and opening balances", () => {
  const txns: RecTxn[] = [
    { amount: 10000, categoryId: "opening", occurredOn: "2026-10-01" },
    { amount: -2000, categoryId: "transfer", occurredOn: "2026-10-02" },
    { amount: 2000, categoryId: "transfer", occurredOn: "2026-10-02" },
    { amount: 1500, categoryId: "sales", occurredOn: "2026-10-03", orderId: "o1" },
    { amount: -100, categoryId: "fees", occurredOn: "2026-10-03", orderId: "o1" },
    { amount: -300, categoryId: "rent", occurredOn: "2026-10-04" },
  ];
  const b = bucketCash(txns, cats, range);
  assert.equal(b.total, 1100);
  assert.equal(b.sales, 1500);
  assert.equal(b.deliveryFees, -100);
  assert.equal(b.opex, -300);
});

test("bridge: net after opex + lines = cash change, nothing unexplained", () => {
  // Month: 3 orders shipped (3000 revenue, 1200 COGS, 300 delivery), Meta ads 400.
  // Cash: 2 of 3 orders settled (2000 sales, −200 fees), ads paid 350, stock bought 2000,
  // rent 500, owner took 1000, capital put in 5000.
  const profit = { grossRevenue: 3000, cogs: 1200, deliveryCost: 300, adSpend: 400, netProfit: 1100 };
  const txns: RecTxn[] = [
    { amount: 2000, categoryId: "sales", occurredOn: "2026-10-10", orderId: "o1" },
    { amount: -200, categoryId: "fees", occurredOn: "2026-10-10", orderId: "o1" },
    { amount: -350, categoryId: "ads", occurredOn: "2026-10-11" },
    { amount: -2000, categoryId: "stock", occurredOn: "2026-10-12" },
    { amount: -500, categoryId: "rent", occurredOn: "2026-10-13" },
    { amount: -1000, categoryId: "withdraw", occurredOn: "2026-10-14" },
    { amount: 5000, categoryId: "capital", occurredOn: "2026-10-15" },
  ];
  const opex = summarizeOpex(txns, cats, range);
  const cash = bucketCash(txns, cats, range);
  const bridge = buildBridge(profit, opex, cash);
  assert.equal(bridge.netAfterOpex, 600);
  assert.equal(bridge.cashChange, 2950);
  const line = (k: string) => bridge.lines.find((l) => l.key === k)?.amount;
  assert.equal(line("collectedVsEarned"), -1000); // one order's money still with the agent
  assert.equal(line("deliveryFees"), 100); // 300 recorded on orders, 200 paid so far
  assert.equal(line("ads"), 50); // Meta 400, paid 350
  assert.equal(line("stock"), -800); // bought 2000, sold goods costing 1200
  assert.equal(line("ownerWithdrawals"), -1000);
  assert.equal(line("capital"), 5000);
  assert.equal(line("other"), 0);
  assert.equal(bridge.unexplained, 0);
});

test("splitRevenue: settled / with agents / outside the treasury", () => {
  const split = splitRevenue(
    [
      { id: "a", totalPrice: 1000 },
      { id: "b", totalPrice: 700 },
      { id: "c", totalPrice: 300 },
    ],
    new Set(["a"]),
    new Set(["b"]),
  );
  assert.deepEqual(split, {
    settled: { count: 1, amount: 1000 },
    withAgents: { count: 1, amount: 700 },
    outside: { count: 1, amount: 300 },
  });
});

test("unlinkedSales counts hand-typed sales only", () => {
  const txns: RecTxn[] = [
    { amount: 1000, categoryId: "sales", occurredOn: "2026-10-03", orderId: "o1" },
    { amount: 250, categoryId: "sales", occurredOn: "2026-10-04", orderId: null },
    { amount: 250, categoryId: "rent", occurredOn: "2026-10-04", orderId: null },
  ];
  assert.deepEqual(unlinkedSales(txns, cats, range), { count: 1, amount: 250 });
});
