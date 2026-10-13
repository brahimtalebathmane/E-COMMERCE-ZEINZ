// 076 — the owner edits and soft-deletes anything; balances, stock and the
// reconciliation follow, staff cannot, and every change lands in the log.
// Runs against all real migrations (PGlite).
import { before, test } from "node:test";
import assert from "node:assert/strict";

import { freshDb, insertProduct, scalar } from "./pglite/harness.mjs";
import { saleMismatches } from "../src/lib/treasury/reconciliation.ts";

type Db = Awaited<ReturnType<typeof freshDb>>;

const MR = `(select id from public.countries where iso_code = 'MR')`;
const cat = (key: string) => `(select id from public.treasury_categories where system_key = '${key}' and country_id = ${MR})`;
const OWNER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";

let db: Db;
const ids: Record<string, string> = {};

const num = async (sql: string, params?: unknown[]) => Number(await scalar(db, sql, params));
const balance = (name: string) => num(`select balance from public.treasury_account_balances where name = $1`, [name]);
const onHand = (productId: string) => num(`select on_hand from public.inventory_stock where product_id = $1`, [productId]);
const logCount = (action?: string) =>
  num(`select count(*) from public.owner_edit_log${action ? " where action = $1" : ""}`, action ? [action] : undefined);

async function newOrder(productId: string, total: number) {
  const res = await db.query<{ id: string }>(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status, quantity, source)
     values ($1, 'c', '+222', $2, 'MRU', 'pending', 1, 'manual') returning id`,
    [productId, total],
  );
  return res.rows[0].id;
}
const change = (id: string, from: string, to: string) => db.query(`select public.change_order_status($1, $2, $3)`, [id, from, to]);

before(async () => {
  db = await freshDb();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@x', '{}'), ($2, 'staff@x', '{"role":"staff"}')`, [OWNER, STAFF]);
  ids.p1 = await insertProduct(db, { slug: "e-1", iso: "MR", costPrice: 100 });
  ids.p2 = await insertProduct(db, { slug: "e-2", iso: "MR", costPrice: 50 });
  await db.query(`select public.inventory_go_live(${MR}, $1::jsonb)`, [JSON.stringify([{ product_id: ids.p1, quantity: 10 }])]);
  await db.query(`select public.treasury_go_live(${MR}, current_date, $1::jsonb, 'Ahmed', null, '[]'::jsonb)`, [
    JSON.stringify([{ name: "Cash", type: "cash", opening_balance: 1000 }, { name: "Bank", type: "bank" }]),
  ]);
  ids.cash = String(await scalar(db, `select id from public.treasury_accounts where name = 'Cash'`));
  ids.bank = String(await scalar(db, `select id from public.treasury_accounts where name = 'Bank'`));
  ids.agent = String(await scalar(db, `select id from public.treasury_parties where name = 'Ahmed'`));
});

test("editing an amount updates the balance (100 → 125)", async () => {
  ids.rent = String(await scalar(db, `select public.treasury_add_transaction(${MR}, $1, ${cat("rent")}, 100, null, current_date, 'rent', null)`, [ids.cash]));
  assert.equal(await balance("Cash"), 900);
  await db.query(`select public.owner_update_transaction($1, '{"amount":125}'::jsonb, $2, 'typo')`, [ids.rent, OWNER]);
  assert.equal(await balance("Cash"), 875);
  assert.equal(await num(`select amount from public.treasury_transactions where id = $1`, [ids.rent]), -125, "expense keeps its sign");
});

test("changing the account moves the money between balances", async () => {
  await db.query(`select public.owner_update_transaction($1, $2::jsonb, $3)`, [ids.rent, JSON.stringify({ account_id: ids.bank }), OWNER]);
  assert.deepEqual([await balance("Cash"), await balance("Bank")], [1000, -125]);
});

test("editing a transfer updates both sides", async () => {
  const group = String(await scalar(db, `select public.treasury_transfer(${MR}, $1, $2, 200, current_date, null)`, [ids.cash, ids.bank]));
  assert.deepEqual([await balance("Cash"), await balance("Bank")], [800, 75]);
  // 300, and the other way round.
  await db.query(`select public.owner_update_transfer($1, 300, current_date, $2, $3, 'fixed', $4)`, [group, ids.bank, ids.cash, OWNER]);
  assert.deepEqual([await balance("Cash"), await balance("Bank")], [1300, -425]);
  await assert.rejects(
    db.query(`select public.owner_update_transaction((select id from public.treasury_transactions where transfer_group_id = $1 limit 1), '{"amount":5}'::jsonb, $2)`, [group, OWNER]),
    /edit a transfer as a whole/,
  );
  ids.group = group;
});

test("editing an automatic settlement entry shows as a difference in the reconciliation", async () => {
  const o = await newOrder(ids.p1, 1000);
  await change(o, "pending", "confirmed");
  await change(o, "confirmed", "shipped");
  ids.order = o;
  await db.query(
    `select public.treasury_settle(${MR}, $1, $2, current_date, $3::jsonb, '[]'::jsonb, true, 1000, null, null)`,
    [ids.agent, ids.cash, JSON.stringify([{ order_id: o }])],
  );
  const saleId = String(await scalar(db, `select id from public.treasury_transactions where order_id = $1 and order_role = 'sale'`, [o]));
  await db.query(`select public.owner_update_transaction($1, '{"amount":900}'::jsonb, $2, 'agent paid less')`, [saleId, OWNER]);

  const sales = (await db.query<{ order_id: string; amount: string }>(
    `select order_id, amount from public.treasury_transactions where order_role = 'sale' and deleted_at is null`,
  )).rows.map((r) => ({ orderId: r.order_id, amount: Number(r.amount) }));
  assert.deepEqual(saleMismatches(sales, new Map([[o, 1000]])), [{ orderId: o, orderTotal: 1000, recorded: 900, difference: -100 }]);
});

test("setting the stock directly gives the right level", async () => {
  assert.equal(await onHand(ids.p1), 9, "10 counted, 1 shipped");
  const delta = await num(`select public.owner_set_stock($1, 7, $2, 'recount')`, [ids.p1, OWNER]);
  assert.equal(delta, -2);
  assert.equal(await onHand(ids.p1), 7);
});

test("editing a restock updates the stock and its treasury expense", async () => {
  const purchase = String(await scalar(db,
    `select public.create_stock_purchase(${MR}, 'Supplier', current_date, 50, null, $1::jsonb)`,
    [JSON.stringify([{ product_id: ids.p1, quantity: 5, unit_cost: 100 }])]));
  const txn = String(await scalar(db, `select public.treasury_record_stock_purchase($1, $2, current_date)`, [purchase, ids.cash]));
  assert.equal(await onHand(ids.p1), 12);
  assert.equal(await num(`select amount from public.treasury_transactions where id = $1`, [txn]), -550);

  const lineId = String(await scalar(db, `select id from public.stock_purchase_lines where purchase_id = $1`, [purchase]));
  await db.query(
    `select public.owner_update_stock_purchase($1, 'Supplier 2', current_date, 0, 'fixed', $2::jsonb, $3)`,
    [purchase, JSON.stringify([{ id: lineId, product_id: ids.p1, quantity: 8, unit_cost: 90 }, { product_id: ids.p2, quantity: 2, unit_cost: 40 }]), OWNER],
  );
  assert.equal(await onHand(ids.p1), 15, "7 + 8");
  assert.equal(await onHand(ids.p2), 2);
  assert.equal(await num(`select amount from public.treasury_transactions where id = $1`, [txn]), -800, "8×90 + 2×40");
  ids.purchase = purchase;
  ids.purchaseTxn = txn;
});

test("an order-linked movement edited by hand stops automatic updates; cancelling restores them", async () => {
  const sale = String(await scalar(db, `select id from public.inventory_movements where order_id = $1 and type = 'sale_out'`, [ids.order]));
  await db.query(`select public.owner_update_movement($1, '{"quantity":-2}'::jsonb, $2)`, [sale, OWNER]);
  assert.equal(await scalar(db, `select stock_manual from public.orders where id = $1`, [ids.order]), true);
  const before = await onHand(ids.p1);
  assert.equal(before, 14, "15 − 1 more unit");

  // The order comes back: no automatic return movement while it is manual.
  await change(ids.order, "shipped", "internal_return");
  assert.equal(await onHand(ids.p1), before);

  await db.query(`select public.owner_reset_order_stock($1, $2)`, [ids.order, OWNER]);
  assert.equal(await scalar(db, `select stock_manual from public.orders where id = $1`, [ids.order]), false);
  assert.equal(
    await num(`select coalesce(sum(quantity), 0) from public.inventory_movements where order_id = $1 and deleted_at is null`, [ids.order]),
    0,
    "shipped then returned resellable: net 0 for the order",
  );
  assert.equal(await onHand(ids.p1), 16);
});

test("delete and restore (transaction, transfer, movement, restock)", async () => {
  await db.query(`select public.owner_set_transaction_deleted($1, true, $2)`, [ids.rent, OWNER]);
  assert.equal(await balance("Bank"), -300, "rent no longer counted");
  await db.query(`select public.owner_set_transaction_deleted($1, false, $2)`, [ids.rent, OWNER]);
  assert.equal(await balance("Bank"), -425);

  const leg = String(await scalar(db, `select id from public.treasury_transactions where transfer_group_id = $1 limit 1`, [ids.group]));
  const n = await num(`select public.owner_set_transaction_deleted($1, true, $2)`, [leg, OWNER]);
  assert.equal(n, 2, "both sides of the transfer");

  const stockBefore = await onHand(ids.p1);
  await db.query(`select public.owner_set_stock_purchase_deleted($1, true, $2)`, [ids.purchase, OWNER]);
  assert.equal(await onHand(ids.p1), stockBefore - 8);
  assert.equal(await scalar(db, `select deleted_at is not null from public.treasury_transactions where id = $1`, [ids.purchaseTxn]), true);
  await db.query(`select public.owner_set_stock_purchase_deleted($1, false, $2)`, [ids.purchase, OWNER]);
  assert.equal(await onHand(ids.p1), stockBefore);
  assert.equal(await scalar(db, `select deleted_at is null from public.treasury_transactions where id = $1`, [ids.purchaseTxn]), true);
});

test("staff cannot edit, and nobody can edit outside an owner edit", async () => {
  await assert.rejects(
    db.query(`select public.owner_update_transaction($1, '{"amount":1}'::jsonb, $2)`, [ids.rent, STAFF]),
    /owner_only/,
  );
  await assert.rejects(db.query(`select public.owner_set_stock($1, 1, $2)`, [ids.p1, STAFF]), /owner_only/);
  await assert.rejects(db.query(`update public.treasury_transactions set amount = 1 where id = $1`, [ids.rent]), /append-only/);
  await assert.rejects(db.query(`update public.inventory_movements set quantity = 1 where product_id = $1`, [ids.p1]), /append-only/);
  await assert.rejects(db.query(`delete from public.treasury_transactions where id = $1`, [ids.rent]), /append-only/);
});

test("every change is in the audit log (who, old and new value, reason)", async () => {
  const row = (await db.query<{ actor: string; old_amount: string; new_amount: string; reason: string }>(
    `select actor, old_data ->> 'amount' as old_amount, new_data ->> 'amount' as new_amount, reason
       from public.owner_edit_log where entity = 'treasury_transactions' and entity_id = $1 and action = 'update'
      order by created_at limit 1`,
    [ids.rent],
  )).rows[0];
  assert.deepEqual([row.actor, Number(row.old_amount), Number(row.new_amount), row.reason], [OWNER, -100, -125, "typo"]);
  assert.ok((await logCount("delete")) >= 4);
  assert.ok((await logCount("restore")) >= 2);
  assert.ok((await logCount("insert")) >= 2, "set-stock adjustment and the new restock line");
  assert.equal(
    await num(`select count(*) from public.owner_edit_log where entity = 'orders' and entity_id = $1`, [ids.order]),
    2,
    "manual flag on, then off",
  );
  await assert.rejects(db.query(`delete from public.owner_edit_log`), /append-only/);
});
