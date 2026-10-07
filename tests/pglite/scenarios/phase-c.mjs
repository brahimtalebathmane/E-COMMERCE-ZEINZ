// Phase C (073/074): treasury — go-live, delivery-agent settlements, transfers,
// reversals, cash count, stock purchase payment, append-only ledger.
import { createReporter, freshDb, insertProduct, readMigration, scalar } from "../harness.mjs";

const MR = `(select id from public.countries where iso_code = 'MR')`;
const SA = `(select id from public.countries where iso_code = 'SA')`;
const cat = (key) => `(select id from public.treasury_categories where system_key = '${key}' and country_id = ${MR})`;

async function newOrder(db, productId, { total = 1000, fee = null, currency = "MRU" } = {}) {
  const res = await db.query(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status, quantity, delivery_cost, source)
     values ($1, 'c', '+222', $2, $3, 'pending', 1, $4, 'manual') returning id`,
    [productId, total, currency, fee],
  );
  return res.rows[0].id;
}
const change = (db, id, from, to) => db.query(`select public.change_order_status($1, $2, $3)`, [id, from, to]);
async function ship(db, id) {
  await change(db, id, "pending", "confirmed");
  await change(db, id, "confirmed", "shipped");
}
const balance = (db, name) =>
  scalar(db, `select balance from public.treasury_account_balances where name = $1`, [name]).then(Number);
const accountId = (db, name) => scalar(db, `select id from public.treasury_accounts where name = $1`, [name]);

async function settle(db, { agent, account, sales = [], returns = [], keepFees = true, received, reason = null }) {
  return scalar(
    db,
    `select public.treasury_settle(${MR}, $1, $2, current_date, $3::jsonb, $4::jsonb, $5, $6, $7, null)`,
    [agent, account, JSON.stringify(sales), JSON.stringify(returns), keepFees, received, reason],
  );
}

export default async function run() {
  const r = createReporter("Phase C — treasury");
  const db = await freshDb();
  const p1 = await insertProduct(db, { slug: "mr-1", iso: "MR", costPrice: 400 });
  const aff = await insertProduct(db, { slug: "sa-1", iso: "SA", fulfillment: "affiliate" });

  await r.ok("default categories seeded for Mauritania only", async () =>
    r.equal(
      Number(await scalar(db, `select count(*) from public.treasury_categories where system_key is not null and country_id = ${MR}`)),
      14,
    ));

  // --- Before go-live ------------------------------------------------------
  const oldPaid = await newOrder(db, p1, { total: 500, fee: 50 });
  await ship(db, oldPaid);
  const oldUnpaid = await newOrder(db, p1, { total: 700, fee: 50 });
  await ship(db, oldUnpaid);
  await r.ok("before go-live a shipped order gets no agent", async () =>
    r.equal(await scalar(db, `select delivery_agent_id from public.orders where id = $1`, [oldPaid]), null));
  await r.fails("quick add refused before go-live", () =>
    db.query(`select public.treasury_add_transaction(${MR}, gen_random_uuid(), ${cat("salaries")}, 10, null, current_date, null, null)`),
    "treasury_not_live");

  // --- Go-live ---------------------------------------------------------------
  await r.ok("go-live: accounts with opening balances, default agent, carried-over order", async () => {
    await db.query(
      `select public.treasury_go_live(${MR}, current_date, $1::jsonb, 'Ahmed', '+22233333333', $2::jsonb)`,
      [JSON.stringify([{ name: "Cash", type: "cash", opening_balance: 1000 }, { name: "Bankily", type: "mobile_wallet", opening_balance: 0 }]),
       JSON.stringify([oldUnpaid])],
    );
    return r.equal([await balance(db, "Cash"), await balance(db, "Bankily")], [1000, 0]);
  });
  const agent = await scalar(db, `select id from public.treasury_parties where name = 'Ahmed'`);
  const cash = await accountId(db, "Cash");
  const bankily = await accountId(db, "Bankily");
  await r.fails("go-live only once", () =>
    db.query(`select public.treasury_go_live(${MR}, current_date, '[{"name":"X","type":"cash"}]'::jsonb, 'B', null, '[]'::jsonb)`),
    "treasury_already_live");
  await r.fails("no treasury for Saudi Arabia", () =>
    db.query(`insert into public.treasury_accounts (country_id, name, type) values (${SA}, 'x', 'cash')`), "local_only");

  // --- Orders after go-live -----------------------------------------------------
  const c = await newOrder(db, p1, { total: 1000, fee: null });
  await ship(db, c);
  await r.ok("shipping after go-live assigns the default agent", async () =>
    r.equal(await scalar(db, `select delivery_agent_id from public.orders where id = $1`, [c]), agent));
  await r.ok("unsettled = carried-over + shipped after go-live (not the paid old one)", async () => {
    const ids = (await db.query(`select order_id from public.treasury_unsettled_orders order by total_price`)).rows.map((x) => x.order_id);
    return r.equal([ids.includes(oldPaid), ids.includes(oldUnpaid), ids.includes(c)], [false, true, true]);
  });
  await r.ok("money held by the agent", async () =>
    r.equal((await db.query(`select unsettled_orders, cash_held::text from public.treasury_agent_holdings where party_id = $1`, [agent])).rows[0],
      { unsettled_orders: 2, cash_held: "1700.00" }));

  // --- Settlement math ---------------------------------------------------------
  let settlementId;
  await r.ok("settlement: collected − fees = expected; fee typed on screen fills delivery_cost", async () => {
    settlementId = await settle(db, {
      agent, account: cash,
      sales: [{ order_id: c, fee: 100 }, { order_id: oldUnpaid, fee: null }],
      received: 1550,
    });
    const s = (await db.query(`select collected::text, fees::text, expected_net::text, difference::text from public.treasury_settlements where id = $1`, [settlementId])).rows[0];
    const fee = await scalar(db, `select delivery_cost::text from public.orders where id = $1`, [c]);
    return r.equal([s, fee], [{ collected: "1700.00", fees: "150.00", expected_net: "1550.00", difference: "0.00" }, "100.00"]);
  });
  await r.ok("one Sales income per order + a Delivery fees expense; net lands in the account", async () => {
    const rows = (await db.query(
      `select order_role, count(*)::int as n, sum(amount)::text as total from public.treasury_transactions where settlement_id = $1 group by order_role order by order_role`,
      [settlementId])).rows;
    return r.equal([rows, await balance(db, "Cash")], [[{ order_role: "delivery_fee", n: 2, total: "-150.00" }, { order_role: "sale", n: 2, total: "1700.00" }], 2550]);
  });
  await r.fails("an order can never be settled twice", () =>
    settle(db, { agent, account: cash, sales: [{ order_id: c }], received: 900 }), "order_not_unsettled");
  await r.ok("agent holds nothing after settling", async () =>
    r.equal(await scalar(db, `select coalesce(sum(cash_held), 0)::text from public.treasury_agent_holdings where party_id = $1`, [agent]), "0"));

  // --- Return after settlement -----------------------------------------------
  await change(db, c, "shipped", "internal_return");
  await r.ok("a settled order that comes back reverses its sale (fee stays)", async () => {
    const rev = (await db.query(`select amount::text from public.treasury_transactions where order_id = $1 and kind = 'reversal'`, [c])).rows;
    return r.equal([rev, await balance(db, "Cash")], [[{ amount: "-1000.00" }], 1550]);
  });
  await r.ok("…and it is not listed again for a return fee", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.treasury_unsettled_orders where order_id = $1`, [c])), 0));

  // --- Returned before settlement: fee only, agent is paid ------------------
  const d = await newOrder(db, p1, { total: 800, fee: 30 });
  await ship(db, d);
  await change(db, d, "shipped", "internal_return");
  await r.ok("returned order appears as a return fee", async () =>
    r.equal(await scalar(db, `select kind from public.treasury_unsettled_orders where order_id = $1`, [d]), "return_fee"));
  await r.ok("settling only a return: expected is negative, the owner pays the agent", async () => {
    await settle(db, { agent, account: cash, returns: [{ order_id: d }], received: -30 });
    return r.equal(await balance(db, "Cash"), 1520);
  });

  // --- Difference needs a reason ---------------------------------------------
  const e = await newOrder(db, p1, { total: 600, fee: 50 });
  await ship(db, e);
  await r.fails("a difference without a reason is refused", () =>
    settle(db, { agent, account: bankily, sales: [{ order_id: e }], received: 530 }), "explain the difference");
  await r.ok("with a reason it is recorded as a separate adjustment", async () => {
    const id = await settle(db, { agent, account: bankily, sales: [{ order_id: e }], received: 530, reason: "agent short 20" });
    const adj = await scalar(db, `select amount::text from public.treasury_transactions where settlement_id = $1 and kind = 'adjustment'`, [id]);
    return r.equal([adj, await balance(db, "Bankily")], ["-20.00", 530]);
  });

  // --- Transfers and reversals ------------------------------------------------
  const totalBefore = Number(await scalar(db, `select sum(balance) from public.treasury_account_balances`));
  let group;
  await r.ok("transfer moves money between accounts, total unchanged", async () => {
    group = await scalar(db, `select public.treasury_transfer(${MR}, $1, $2, 200, current_date, 'to wallet')`, [cash, bankily]);
    const total = Number(await scalar(db, `select sum(balance) from public.treasury_account_balances`));
    return r.equal([await balance(db, "Cash"), await balance(db, "Bankily"), total], [1320, 730, totalBefore]);
  });
  await r.ok("transfers are profit-neutral (category counted as none)", async () =>
    r.equal(await scalar(db, `select counted_in_profit_by from public.treasury_categories where system_key = 'transfer'`), "none"));
  const leg = await scalar(db, `select id from public.treasury_transactions where transfer_group_id = $1 limit 1`, [group]);
  await r.ok("reversing a transfer reverses both legs", async () => {
    const n = await scalar(db, `select public.treasury_reverse($1, 'typed wrong account')`, [leg]);
    return r.equal([n, await balance(db, "Cash"), await balance(db, "Bankily")], [2, 1520, 530]);
  });
  await r.fails("a transaction is reversed only once", () => db.query(`select public.treasury_reverse($1, 'again')`, [leg]), "already reversed");
  await r.fails("a reversal cannot be reversed", async () => {
    const rev = await scalar(db, `select id from public.treasury_transactions where reverses_id = $1`, [leg]);
    await db.query(`select public.treasury_reverse($1, 'x')`, [rev]);
  }, "cannot be reversed");
  await r.fails("settlement entries are corrected by voiding, not reversing", async () => {
    const t = await scalar(db, `select id from public.treasury_transactions where settlement_id = $1 limit 1`, [settlementId]);
    await db.query(`select public.treasury_reverse($1, 'x')`, [t]);
  }, "voiding the settlement");

  // --- Quick add ---------------------------------------------------------------
  await r.ok("expense amounts are stored negative, income positive", async () => {
    await db.query(`select public.treasury_add_transaction(${MR}, $1, ${cat("salaries")}, 500, null, current_date, 'october', null)`, [cash]);
    await db.query(`select public.treasury_add_transaction(${MR}, $1, ${cat("capital")}, 300, null, current_date, 'owner', null)`, [cash]);
    return r.equal(await balance(db, "Cash"), 1320);
  });
  await r.fails("transfers can't be typed in the quick add", () =>
    db.query(`select public.treasury_add_transaction(${MR}, $1, ${cat("transfer")}, 5, null, current_date, null, null)`, [cash]),
    "dedicated screen");
  await r.fails("no future dates", () =>
    db.query(`select public.treasury_add_transaction(${MR}, $1, ${cat("rent")}, 5, null, current_date + 1, null, null)`, [cash]),
    "future");

  // --- Cash count ---------------------------------------------------------------
  await r.fails("a cash count difference needs a reason", () =>
    db.query(`select public.treasury_cash_count($1, 1300, null)`, [cash]), "reason");
  await r.ok("cash count records the difference as an adjustment", async () => {
    const diff = await scalar(db, `select public.treasury_cash_count($1, 1300, 'counted the box')`, [cash]);
    return r.equal([Number(diff), await balance(db, "Cash")], [-20, 1300]);
  });

  // --- Stock purchase paid from the treasury ------------------------------------
  await db.query(`select public.inventory_go_live(${MR}, $1::jsonb)`, [JSON.stringify([{ product_id: p1, quantity: 5 }])]);
  const purchase = await scalar(db,
    `select public.create_stock_purchase(${MR}, 'Supplier', current_date, 50, null, $1::jsonb)`,
    [JSON.stringify([{ product_id: p1, quantity: 2, unit_cost: 100 }])]);
  await r.ok("a stock purchase creates its Stock purchases expense", async () => {
    await db.query(`select public.treasury_record_stock_purchase($1, $2, null)`, [purchase, cash]);
    const linked = await scalar(db, `select treasury_transaction_id is not null from public.stock_purchases where id = $1`, [purchase]);
    return r.equal([linked, await balance(db, "Cash")], [true, 1050]);
  });
  await r.fails("…only once", () => db.query(`select public.treasury_record_stock_purchase($1, $2, null)`, [purchase, cash]), "already paid");

  // --- Void a settlement --------------------------------------------------------
  const f = await newOrder(db, p1, { total: 400, fee: 40 });
  await ship(db, f);
  const wrong = await settle(db, { agent, account: cash, sales: [{ order_id: f }], received: 360 });
  await r.ok("voiding a settlement reverses it and frees the order", async () => {
    await db.query(`select public.treasury_void_settlement($1, 'ticked the wrong order')`, [wrong]);
    const listed = Number(await scalar(db, `select count(*) from public.treasury_unsettled_orders where order_id = $1`, [f]));
    return r.equal([listed, await balance(db, "Cash")], [1, 1050]);
  });
  await r.ok("…and it can then be settled again", async () => {
    await settle(db, { agent, account: cash, sales: [{ order_id: f }], received: 360 });
    return r.equal(await balance(db, "Cash"), 1410);
  });

  // --- Affiliate orders are never touched ----------------------------------------
  const a1 = (await db.query(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status) values ($1, 'c', '+966', 100, 'SAR', 'pending') returning id`,
    [aff])).rows[0].id;
  await change(db, a1, "pending", "confirmed");
  await change(db, a1, "confirmed", "shipped");
  await r.ok("affiliate (SA) order: no agent, never owed", async () =>
    r.equal([await scalar(db, `select delivery_agent_id from public.orders where id = $1`, [a1]),
             Number(await scalar(db, `select count(*) from public.treasury_unsettled_orders where order_id = $1`, [a1]))], [null, 0]));

  // --- Ledger integrity -------------------------------------------------------------
  await r.fails("transactions are append-only (update)", () => db.exec(`update public.treasury_transactions set amount = 1`), "append-only");
  await r.fails("transactions are append-only (delete)", () => db.exec(`delete from public.treasury_transactions`), "append-only");
  await r.ok("every transaction is in the audit log", async () =>
    r.equal(
      Number(await scalar(db, `select count(*) from public.treasury_transactions t where not exists (select 1 from public.treasury_audit_log l where l.entity_id = t.id)`)),
      0,
    ));
  await r.ok("a subcategory inherits its parent's direction and profit treatment", async () => {
    const id = await scalar(db, `select public.treasury_create_category(${MR}, 'كهرباء', ${cat("daily_expenses")}, 'income', 'none')`);
    return r.equal((await db.query(`select direction, counted_in_profit_by from public.treasury_categories where id = $1`, [id])).rows[0],
      { direction: "expense", counted_in_profit_by: "opex" });
  });
  await r.ok("authenticated users cannot write or call treasury functions", async () =>
    r.equal([
      await scalar(db, `select has_table_privilege('authenticated', 'public.treasury_transactions', 'insert')`),
      await scalar(db, `select has_function_privilege('authenticated', 'public.treasury_settle(uuid, uuid, uuid, date, jsonb, jsonb, boolean, numeric, text, text, uuid)', 'execute')`),
    ], [false, false]));

  for (const file of ["073_treasury.sql", "074_treasury_functions.sql"]) {
    await r.ok(`${file} re-runs cleanly`, () => db.exec(readMigration(file)).then(() => undefined));
  }
  await r.ok("re-run does not duplicate categories or change balances", async () =>
    r.equal([Number(await scalar(db, `select count(*) from public.treasury_categories where system_key is not null`)), await balance(db, "Cash")], [14, 1410]));

  await db.close();
  return r.results;
}
