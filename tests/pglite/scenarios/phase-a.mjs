// Phase A (migrations 067–069): local-operations flag, orders.country_id,
// SARL fix, ISO currency constraint, country-change guard, autofill safety net.
import { createReporter, ensureCountry, freshDb, insertProduct, readMigration, scalar } from "../harness.mjs";

const orderInsert = (productSlug, { currency = "MRU", status = "pending", country = undefined, source = "storefront" } = {}) => `
  insert into public.orders (product_id, customer_name, phone, total_price, currency, status, source${country ? ", country_id" : ""})
  select id, 'c', '+1', 100, '${currency}', '${status}', '${source}'${country ? `, ${country}` : ""}
  from public.products where slug = '${productSlug}'`;

export default async function run() {
  const r = createReporter("Phase A — 067/068/069");

  // Production-like history: data exists before 067 runs.
  const db = await freshDb({
    beforeEach: async (file, d) => {
      if (file !== "067_countries_local_operations.sql") return;
      await ensureCountry(d, "KW", "KWD", "الكويت");
      await insertProduct(d, { slug: "mr-1", iso: "MR" });
      await insertProduct(d, { slug: "sa-1", iso: "SA", fulfillment: "affiliate" });
      await insertProduct(d, { slug: "kw-1", iso: "KW", fulfillment: "affiliate" });
      await d.exec(orderInsert("mr-1", { status: "shipped" }));
      await d.exec(orderInsert("sa-1", { currency: "SAR", status: "shipped" }));
      await d.exec(orderInsert("kw-1", { currency: "KWD", status: "shipped" }));
      await d.exec(orderInsert("sa-1", { currency: "SARL", status: "cancelled" }));
    },
  });

  await r.ok("only MR has local operations", async () =>
    r.equal(
      await scalar(db, `select string_agg(iso_code || '=' || has_local_operations, ',' order by iso_code) from public.countries_public`),
      "KW=false,MR=true,SA=false",
    ),
  );
  await r.fails("flag cannot be set on SA", () =>
    db.exec(`update public.countries set has_local_operations = true where iso_code = 'SA'`), "countries_local_operations_mr_only");
  await r.ok("every order has a country", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.orders where country_id is null`)), 0));
  await r.ok("SARL rewritten to SAR", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.orders where currency = 'SARL'`)), 0));
  await r.fails("non-ISO currency rejected", () => db.exec(orderInsert("sa-1", { currency: "ريال" })), "orders_currency_iso_check");
  await r.ok("country_id is NOT NULL", async () =>
    r.equal(await scalar(db, `select is_nullable from information_schema.columns where table_name='orders' and column_name='country_id'`), "NO"));

  const logBefore = Number(await scalar(db, `select count(*) from public.orders_country_id_autofill_log`));
  await r.ok("missing country_id is filled from the product (never blocks an order)", async () => {
    await db.exec(orderInsert("mr-1"));
    return r.equal(
      await scalar(db, `select c.iso_code from public.orders o join public.countries c on c.id = o.country_id order by o.created_at desc limit 1`),
      "MR",
    );
  });
  await r.ok("…and logged", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.orders_country_id_autofill_log`)), logBefore + 1));
  await r.ok("explicit correct country is not logged", async () => {
    await db.exec(orderInsert("mr-1", { country: `(select country_id from public.products where slug = 'mr-1')` }));
    return r.equal(Number(await scalar(db, `select count(*) from public.orders_country_id_autofill_log`)), logBefore + 1);
  });
  await r.fails("explicit wrong country rejected", () =>
    db.exec(orderInsert("mr-1", { country: `(select id from public.countries where iso_code = 'SA')` })), "does not match");
  await r.fails("product with orders cannot change country", () =>
    db.exec(`update public.products set country_id = (select id from public.countries where iso_code = 'KW') where slug = 'sa-1'`),
    "cannot be changed");

  for (const file of ["067_countries_local_operations.sql", "068_orders_country_id.sql", "069_orders_country_id_not_null.sql"]) {
    await r.ok(`${file} re-runs cleanly`, () => db.exec(readMigration(file)).then(() => undefined));
  }
  await db.close();
  return r.results;
}
