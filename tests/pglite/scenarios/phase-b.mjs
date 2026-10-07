// Phase B (071/072): inventory ledger, order → stock sync, go-live rules,
// restocks, adjustments, compare-and-set status changes.
import { createReporter, freshDb, insertProduct, readMigration, scalar } from "../harness.mjs";

const MR = `(select id from public.countries where iso_code = 'MR')`;
const SA = `(select id from public.countries where iso_code = 'SA')`;

async function newOrder(db, productId, { qty = 1, status = "pending", currency = "MRU" } = {}) {
  const res = await db.query(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status, quantity, unit_cost_price, source)
     select $1, 'c', '+222', 100 * $2, $3, $4, $2, p.cost_price, 'manual' from public.products p where p.id = $1
     returning id`,
    [productId, qty, currency, status],
  );
  return res.rows[0].id;
}

const change = (db, id, from, to, disposition = null) =>
  db.query(`select public.change_order_status($1, $2, $3, null, $4) as s`, [id, from, to, disposition]);

const onHand = (db, productId) =>
  scalar(db, `select coalesce(sum(quantity), 0)::int from public.inventory_movements where product_id = $1`, [productId]).then(Number);

const orderMoves = (db, orderId) =>
  db
    .query(
      `select type, quantity, is_correction from public.inventory_movements where order_id = $1 order by created_at, type`,
      [orderId],
    )
    .then((r) => r.rows.map((m) => `${m.type}${m.quantity > 0 ? "+" : ""}${m.quantity}${m.is_correction ? "c" : ""}`));

export default async function run() {
  const r = createReporter("Phase B — inventory");
  const db = await freshDb();

  const p1 = await insertProduct(db, { slug: "mr-1", iso: "MR", costPrice: 400 });
  const p2 = await insertProduct(db, { slug: "mr-2", iso: "MR", costPrice: 50 });
  const aff = await insertProduct(db, { slug: "sa-1", iso: "SA", fulfillment: "affiliate" });

  // --- Before go-live: nothing moves -------------------------------------
  const early = await newOrder(db, p1, { qty: 2 });
  await change(db, early, "pending", "confirmed");
  await change(db, early, "confirmed", "shipped");
  await r.ok("before go-live a shipped order creates no movement", async () =>
    r.equal(await orderMoves(db, early), []));
  await r.ok("shipped_at is stamped anyway", async () =>
    r.equal(Boolean(await scalar(db, `select shipped_at is not null from public.orders where id = $1`, [early])), true));
  await r.fails("restock refused before go-live", () =>
    db.query(`select public.create_stock_purchase(${MR}, 's', current_date, 0, null, $1::jsonb)`,
      [JSON.stringify([{ product_id: p1, quantity: 1, unit_cost: 1 }])]), "inventory_not_live");
  await r.fails("go-live refused for Saudi Arabia", () =>
    db.query(`select public.inventory_go_live(${SA}, '[]'::jsonb)`), "local-operations");

  // --- Go-live with the opening count -----------------------------------
  await r.ok("go-live records the opening count", async () => {
    await db.query(`select public.inventory_go_live(${MR}, $1::jsonb)`,
      [JSON.stringify([{ product_id: p1, quantity: 10 }, { product_id: p2, quantity: 5 }])]);
    return r.equal([await onHand(db, p1), await onHand(db, p2)], [10, 5]);
  });
  await r.fails("go-live only once", () => db.query(`select public.inventory_go_live(${MR}, '[]'::jsonb)`), "inventory_already_live");
  await r.fails("go-live date cannot be changed", () =>
    db.exec(`update public.inventory_settings set go_live_at = now() - interval '1 day'`), "cannot be changed");

  // --- Pre-go-live shipment returned after go-live: stock comes back ----
  await change(db, early, "shipped", "internal_return");
  await r.ok("return of an order shipped before go-live still adds stock", async () =>
    r.equal([await orderMoves(db, early), await onHand(db, p1)], [["return_in+2"], 12]));

  // --- Normal flow ------------------------------------------------------
  const o = await newOrder(db, p1, { qty: 2 });
  await change(db, o, "pending", "confirmed");
  await r.ok("confirmed = reserved, on hand unchanged", async () =>
    r.equal(
      (await db.query(`select on_hand, reserved, available from public.inventory_stock where product_id = $1`, [p1])).rows[0],
      { on_hand: 12, reserved: 2, available: 10 },
    ));
  await change(db, o, "confirmed", "shipped");
  await r.ok("shipping deducts exactly once", async () =>
    r.equal([await orderMoves(db, o), await onHand(db, p1)], [["sale_out-2"], 10]));
  await r.fails("retrying the same change is rejected (compare-and-set)", () => change(db, o, "confirmed", "shipped"), "status_conflict");
  await r.ok("…and stock is unchanged", async () => r.equal(await onHand(db, p1), 10));
  await r.ok("syncing again is a no-op", async () => {
    await db.query(`select public.sync_order_stock($1)`, [o]);
    await db.query(`select public.sync_order_stock($1)`, [o]);
    return r.equal(await orderMoves(db, o), ["sale_out-2"]);
  });
  await r.ok("one history row per change", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.order_status_history where order_id = $1`, [o])), 2));

  // Quantity edit on a shipped order
  await db.query(`update public.orders set quantity = 3 where id = $1`, [o]);
  await r.ok("quantity edit on a shipped order posts a correction", async () =>
    r.equal([await orderMoves(db, o), await onHand(db, p1)], [["sale_out-2", "sale_out-1c"], 9]));

  // Soft-delete and restore
  await db.query(`update public.orders set deleted_at = now() where id = $1`, [o]);
  await r.ok("soft-deleting a shipped order reverses its sale_out", async () => r.equal(await onHand(db, p1), 12));
  await db.query(`update public.orders set deleted_at = null where id = $1`, [o]);
  await r.ok("restoring re-applies it", async () => r.equal(await onHand(db, p1), 9));

  // Return: damaged
  await change(db, o, "shipped", "internal_return", "damaged");
  await r.ok("damaged return = return_in then damage (net still out)", async () =>
    r.equal([(await orderMoves(db, o)).slice(-2).sort(), await onHand(db, p1)], [["damage-3", "return_in+3"], 9]));

  // Return: resellable (default)
  const o2 = await newOrder(db, p2, { qty: 1 });
  await change(db, o2, "pending", "confirmed");
  await change(db, o2, "confirmed", "shipped");
  await change(db, o2, "shipped", "internal_return");
  await r.ok("resellable return (default) puts it back", async () =>
    r.equal([await scalar(db, `select return_disposition from public.orders where id = $1`, [o2]), await onHand(db, p2)], ["resellable", 5]));

  // Cancel before shipping / return without shipping
  const o3 = await newOrder(db, p2, { qty: 4 });
  await change(db, o3, "pending", "confirmed");
  await change(db, o3, "confirmed", "cancelled");
  await r.ok("cancelled before shipping: no movement", async () => r.equal(await orderMoves(db, o3), []));
  const o4 = await newOrder(db, p2, { qty: 1 });
  await change(db, o4, "pending", "confirmed");
  await change(db, o4, "confirmed", "internal_return");
  await r.ok("internal_return without shipping: no movement, no return date", async () =>
    r.equal([await orderMoves(db, o4), await scalar(db, `select returned_at from public.orders where id = $1`, [o4])], [[], null]));

  // Affiliate orders are never touched
  const a1 = await newOrder(db, aff, { qty: 1, currency: "SAR" });
  await change(db, a1, "pending", "confirmed");
  await change(db, a1, "confirmed", "shipped");
  await r.ok("affiliate (SA) order: no movement", async () => r.equal(await orderMoves(db, a1), []));
  await r.fails("a movement can't be recorded for an affiliate product", () =>
    db.query(`insert into public.inventory_movements (country_id, product_id, quantity, type, reason) values (${MR}, $1, 1, 'adjustment', 'x')`, [aff]),
    "owned products");

  // Ledger integrity
  await r.fails("movements are append-only (update)", () => db.exec(`update public.inventory_movements set quantity = 99`), "append-only");
  await r.fails("movements are append-only (delete)", () => db.exec(`delete from public.inventory_movements`), "append-only");

  // Status CAS errors
  await r.fails("unknown order", () => change(db, "00000000-0000-4000-8000-000000000000", "pending", "confirmed"), "order_not_found");

  // --- Restock with landed cost ----------------------------------------
  await r.ok("restock spreads extra costs by value", async () => {
    const id = await scalar(db,
      `select public.create_stock_purchase(${MR}, 'Supplier A', current_date, 100, 'inv 7', $1::jsonb)`,
      [JSON.stringify([{ product_id: p1, quantity: 10, unit_cost: 30 }, { product_id: p2, quantity: 10, unit_cost: 20 }])]);
    const lines = (await db.query(
      `select product_id = $2 as is_p1, landed_unit_cost::text as landed from public.stock_purchase_lines where purchase_id = $1 order by is_p1 desc`,
      [id, p1])).rows.map((x) => x.landed);
    // value 300 + 200 = 500; p1 gets 60 of the 100 -> +6/unit, p2 gets 40 -> +4/unit
    return r.equal(lines, ["36.0000", "24.0000"]);
  });
  await r.ok("restock adds on hand", async () => r.equal([await onHand(db, p1), await onHand(db, p2)], [19, 15]));

  // --- Manual adjustments -------------------------------------------------
  await r.fails("adjustment needs a reason", () =>
    db.query(`select public.record_inventory_adjustment(${MR}, $1, -1, 'adjustment', '  ')`, [p1]), "reason");
  await r.fails("damage must remove stock", () =>
    db.query(`select public.record_inventory_adjustment(${MR}, $1, 2, 'damage', 'broken')`, [p1]), "negative");
  await r.ok("adjustment with a reason", async () => {
    await db.query(`select public.record_inventory_adjustment(${MR}, $1, -2, 'damage', 'broken in storage')`, [p1]);
    return r.equal(await onHand(db, p1), 17);
  });
  await r.fails("low-stock threshold can't be negative", () =>
    db.query(`update public.products set low_stock_threshold = -1 where id = $1`, [p1]), "low_stock_threshold");

  // --- RLS / grants -------------------------------------------------------
  await r.ok("authenticated users cannot write movements or call the functions", async () => {
    const insertPriv = await scalar(db, `select has_table_privilege('authenticated', 'public.inventory_movements', 'insert')`);
    const fnPriv = await scalar(db, `select has_function_privilege('authenticated', 'public.change_order_status(uuid, text, text, uuid, text)', 'execute')`);
    return r.equal([insertPriv, fnPriv], [false, false]);
  });

  // --- Idempotent migrations ---------------------------------------------
  for (const file of ["071_inventory.sql", "072_inventory_functions.sql"]) {
    await r.ok(`${file} re-runs cleanly`, () => db.exec(readMigration(file)).then(() => undefined));
  }
  await r.ok("stock unchanged by the re-run", async () => r.equal([await onHand(db, p1), await onHand(db, p2)], [17, 15]));

  await db.close();
  return r.results;
}
