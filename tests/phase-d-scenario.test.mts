// Phase D full scenario: a month of WhatsApp sales in Mauritania run through
// the real migrations (PGlite), then the profits page and the reconciliation
// report computed from what the database holds. The bridge must explain the
// whole gap between profit and cash.
import { before, test } from "node:test";
import assert from "node:assert/strict";

import { freshDb, insertProduct, scalar } from "./pglite/harness.mjs";
import { buildProductProfitRows, sumProfitTotals, type ProfitOrderInput } from "../src/lib/analytics/profit.ts";
import {
  bucketCash,
  buildBridge,
  splitRevenue,
  summarizeOpex,
  unlinkedSales,
  type RecCategory,
  type RecTxn,
} from "../src/lib/treasury/reconciliation.ts";

type Db = Awaited<ReturnType<typeof freshDb>>;

const MR = `(select id from public.countries where iso_code = 'MR')`;
const cat = (key: string) => `(select id from public.treasury_categories where system_key = '${key}' and country_id = ${MR})`;

let db: Db;
let today: string;
const ids: Record<string, string> = {};

async function newOrder(productId: string, total: number, fee: number | null): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status, quantity, delivery_cost, source)
     values ($1, 'c', '+222', $2, 'MRU', 'pending', 1, $3, 'manual') returning id`,
    [productId, total, fee],
  );
  return res.rows[0].id;
}
const change = (id: string, from: string, to: string) => db.query(`select public.change_order_status($1, $2, $3)`, [id, from, to]);
async function ship(id: string) {
  await change(id, "pending", "confirmed");
  await change(id, "confirmed", "shipped");
}
const add = (account: string, key: string, amount: number) =>
  scalar(db, `select public.treasury_add_transaction(${MR}, $1, ${cat(key)}, $2, null, current_date, null, null)`, [account, amount]);
const balanceSum = async () =>
  Number(await scalar(db, `select coalesce(sum(balance), 0) from public.treasury_account_balances`));

before(async () => {
  db = await freshDb();
  today = String(await scalar(db, `select public.treasury_today()::text`));
  const p1 = await insertProduct(db, { slug: "mr-a", iso: "MR", costPrice: 400 });
  const p2 = await insertProduct(db, { slug: "mr-b", iso: "MR" }); // no cost price
  ids.p1 = p1;
  ids.p2 = p2;

  await db.query(
    `select public.treasury_go_live(${MR}, current_date, $1::jsonb, 'Ahmed', null, '[]'::jsonb)`,
    [JSON.stringify([{ name: "Cash", type: "cash", opening_balance: 10000 }, { name: "Bankily", type: "mobile_wallet" }])],
  );
  const agent = String(await scalar(db, `select id from public.treasury_parties where name = 'Ahmed'`));
  const cash = String(await scalar(db, `select id from public.treasury_accounts where name = 'Cash'`));
  const bankily = String(await scalar(db, `select id from public.treasury_accounts where name = 'Bankily'`));

  // Five WhatsApp sales shipped by Ahmed; o5 comes back.
  const o1 = await newOrder(p1, 1000, 100);
  const o2 = await newOrder(p1, 1500, 100);
  const o3 = await newOrder(p1, 800, null); // fee unknown yet, still with the agent
  const o4 = await newOrder(p2, 600, 50);
  const o5 = await newOrder(p1, 900, 100);
  for (const o of [o1, o2, o3, o4, o5]) await ship(o);
  await change(o5, "shipped", "internal_return");
  Object.assign(ids, { o1, o2, o3, o4, o5 });

  // Settlement 1: o1 + o2, agent keeps his fees → 2300 exact.
  await db.query(
    `select public.treasury_settle(${MR}, $1, $2, current_date, $3::jsonb, '[]'::jsonb, true, 2300, null, null)`,
    [agent, cash, JSON.stringify([{ order_id: o1 }, { order_id: o2 }])],
  );
  // Settlement 2: o4 sale + o5 return fee; expected 600 − 50 − 100 = 450, received 440.
  await db.query(
    `select public.treasury_settle(${MR}, $1, $2, current_date, $3::jsonb, $4::jsonb, true, 440, 'short 10', null)`,
    [agent, cash, JSON.stringify([{ order_id: o4 }]), JSON.stringify([{ order_id: o5 }])],
  );

  await add(bankily, "capital", 5000);
  await add(cash, "rent", 3000);
  await add(cash, "salaries", 2000);
  await add(bankily, "ads", 700);
  await add(cash, "owner_withdrawals", 1000);
  await add(bankily, "stock_purchases", 1500);
  await db.query(`select public.treasury_transfer(${MR}, $1, $2, 2000, current_date, null)`, [cash, bankily]);
  const mistake = await add(cash, "daily_expenses", 200);
  await db.query(`select public.treasury_reverse($1, 'typed twice')`, [mistake]);
  const cashBalance = Number(await scalar(db, `select balance from public.treasury_account_balances where name = 'Cash'`));
  await db.query(`select public.treasury_cash_count($1, $2, 'found 50')`, [cash, cashBalance + 50]);

  await db.query(`insert into public.product_ad_spend_daily (product_id, date, amount) values ($1, current_date, 500)`, [p1]);
});

async function loadAll() {
  const categories: RecCategory[] = (
    await db.query<{ id: string; parent_id: string | null; name_ar: string; system_key: string | null; counted_in_profit_by: RecCategory["countedInProfitBy"] }>(
      `select id, parent_id, name_ar, system_key, counted_in_profit_by from public.treasury_categories`,
    )
  ).rows.map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name_ar, systemKey: c.system_key, countedInProfitBy: c.counted_in_profit_by }));
  const txns: RecTxn[] = (
    await db.query<{ amount: string; category_id: string; occurred_on: string; order_id: string | null }>(
      `select amount, category_id, occurred_on::text, order_id from public.treasury_transactions`,
    )
  ).rows.map((t) => ({ amount: Number(t.amount), categoryId: t.category_id, occurredOn: t.occurred_on, orderId: t.order_id }));
  const orders: (ProfitOrderInput & { id: string })[] = (
    await db.query<{ id: string; product_id: string; total_price: string; status: string; ordered_at: Date; delivery_cost: string | null; quantity: number; unit_cost_price: string | null }>(
      `select id, product_id, total_price, status, ordered_at, delivery_cost, quantity, unit_cost_price from public.orders`,
    )
  ).rows.map((o) => ({
    id: o.id,
    product_id: o.product_id,
    total_price: Number(o.total_price),
    status: o.status as ProfitOrderInput["status"],
    ordered_at: new Date(o.ordered_at).toISOString(),
    delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
    quantity: o.quantity,
    unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
  }));
  return { categories, txns, orders };
}

test("Phase D scenario: profit after opex and a fully explained profit → cash bridge", async () => {
  const { categories, txns, orders } = await loadAll();
  const range = { startKey: today, endKey: today };
  const products = new Map([
    [ids.p1, { name: "A", costPrice: 400 }],
    [ids.p2, { name: "B", costPrice: null }],
  ]);
  const totals = sumProfitTotals(
    buildProductProfitRows({ orders, products, adSpendDaily: [{ product_id: ids.p1, date: today, amount: 500 }] }),
  );
  // Revenue o1+o2+o3+o4 (o5 returned), COGS 3 × 400, delivery 100+100+50, Meta 500.
  assert.deepEqual(
    [totals.grossRevenue, totals.cogs, totals.deliveryCost, totals.adSpend, totals.netProfit],
    [3900, 1200, 250, 500, 1950],
  );

  // Opex: rent 3000 + salaries 2000 + settlement short 10 − cash surplus 50; the reversed 200 nets to 0.
  // Ads (700) are counted by orders through Meta and never subtracted again.
  const opex = summarizeOpex(txns, categories, range);
  assert.equal(opex.total, 4960);
  assert.equal(totals.netProfit - opex.total, -3010);

  const cash = bucketCash(txns, categories, range);
  // The cash change equals what the accounts really did, minus the opening balance.
  assert.equal(cash.total, (await balanceSum()) - 10000);
  assert.equal(cash.total, -410);

  const bridge = buildBridge(totals, opex, cash);
  assert.equal(bridge.unexplained, 0);
  const line = (k: string) => bridge.lines.find((l) => l.key === k)?.amount;
  assert.equal(line("collectedVsEarned"), -800, "o3's 800 is still with Ahmed");
  assert.equal(line("deliveryFees"), -100, "the return fee paid for o5 is not in order profit");
  assert.equal(line("ads"), -200, "paid 700 to Meta, 500 synced");
  assert.equal(line("stock"), -300, "bought 1500, sold goods costing 1200");
  assert.equal(line("ownerWithdrawals"), -1000);
  assert.equal(line("capital"), 5000);
  assert.equal(line("other"), 0);

  const revenueOrders = orders.filter((o) => o.status === "shipped");
  const settled = new Set(
    (await db.query<{ order_id: string }>(`select order_id from public.treasury_settlement_orders where not voided and kind = 'sale'`)).rows.map((r) => r.order_id),
  );
  const unsettled = new Set(
    (await db.query<{ order_id: string }>(`select order_id from public.treasury_unsettled_orders where kind = 'sale'`)).rows.map((r) => r.order_id),
  );
  assert.deepEqual(
    splitRevenue(revenueOrders.map((o) => ({ id: o.id, totalPrice: o.total_price })), settled, unsettled),
    { settled: { count: 3, amount: 3100 }, withAgents: { count: 1, amount: 800 }, outside: { count: 0, amount: 0 } },
  );
  assert.deepEqual(unlinkedSales(txns, categories, range), { count: 0, amount: 0 });

  // Data-quality flags the report raises for this month.
  assert.deepEqual(revenueOrders.filter((o) => o.delivery_cost == null).map((o) => o.id), [ids.o3]);
  assert.deepEqual(
    revenueOrders.filter((o) => o.unit_cost_price == null && products.get(o.product_id)?.costPrice == null).map((o) => o.id),
    [ids.o4],
  );
});

test("Phase D scenario: a hand-typed sale shows as unlinked and moves the bridge, still explained", async () => {
  const cashId = String(await scalar(db, `select id from public.treasury_accounts where name = 'Cash'`));
  await add(cashId, "sales", 250);
  const { categories, txns, orders } = await loadAll();
  const range = { startKey: today, endKey: today };
  assert.deepEqual(unlinkedSales(txns, categories, range), { count: 1, amount: 250 });
  const totals = sumProfitTotals(
    buildProductProfitRows({
      orders,
      products: new Map([
        [ids.p1, { name: "A", costPrice: 400 }],
        [ids.p2, { name: "B", costPrice: null }],
      ]),
      adSpendDaily: [{ product_id: ids.p1, date: today, amount: 500 }],
    }),
  );
  const bridge = buildBridge(totals, summarizeOpex(txns, categories, range), bucketCash(txns, categories, range));
  assert.equal(bridge.lines.find((l) => l.key === "collectedVsEarned")?.amount, -550);
  assert.equal(bridge.unexplained, 0);
});
