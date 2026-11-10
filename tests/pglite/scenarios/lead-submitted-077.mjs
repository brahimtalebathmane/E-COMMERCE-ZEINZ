// 077: LeadSubmitted ledger (once per click id) + meta_event_log type.
import { createReporter, freshDb, insertProduct, readMigration, scalar } from "../harness.mjs";

async function newOrder(db, productId) {
  const res = await db.query(
    `insert into public.orders (product_id, customer_name, phone, total_price, currency, status, quantity, source, manual_sale_channel)
     values ($1, 'c', '+22236000000', 100, 'MRU', 'pending', 1, 'manual', 'whatsapp') returning id`,
    [productId],
  );
  return res.rows[0].id;
}

const claim = (db, clid, orderId) =>
  db.query(
    `insert into public.meta_lead_submitted (ctwa_clid, order_id, event_id) values ($1, $2::uuid, 'leadsubmitted_' || $3)`,
    [clid, orderId, orderId],
  );

export default async function run() {
  const r = createReporter("077 — LeadSubmitted ledger");
  const db = await freshDb();
  const productId = await insertProduct(db, { slug: "ls-077", iso: "MR", currency: "MRU" });
  const orderA = await newOrder(db, productId);
  const orderB = await newOrder(db, productId);

  await r.ok("first claim for a click id is accepted, defaults to state claimed", async () => {
    await claim(db, "clid-1", orderA);
    return r.equal(
      await scalar(db, `select state || ':' || attempt_count from public.meta_lead_submitted where ctwa_clid = 'clid-1'`),
      "claimed:1",
    );
  });

  await r.fails(
    "a second claim for the same click id (another order, another admin) is refused",
    () => claim(db, "clid-1", orderB),
    "duplicate key",
  );

  await r.ok("compare-and-set on claim_token: a stale token takes nothing", async () => {
    const res = await db.query(
      `update public.meta_lead_submitted set state = 'claimed', claim_token = gen_random_uuid()
       where ctwa_clid = 'clid-1' and claim_token = gen_random_uuid() returning ctwa_clid`,
    );
    return r.equal(res.rows.length, 0);
  });

  await r.fails(
    "unknown state is refused",
    () => db.query(`update public.meta_lead_submitted set state = 'queued' where ctwa_clid = 'clid-1'`),
    "check constraint",
  );

  await r.ok("hard delete of the order keeps the ledger row (order_id set null)", async () => {
    await claim(db, "clid-2", orderB);
    await db.query(`alter table public.orders disable trigger user`);
    await db.query(`delete from public.order_status_history where order_id = $1`, [orderB]);
    await db.query(`delete from public.orders where id = $1`, [orderB]);
    await db.query(`alter table public.orders enable trigger user`);
    return r.equal(
      await scalar(db, `select coalesce(order_id::text, 'null') from public.meta_lead_submitted where ctwa_clid = 'clid-2'`),
      "null",
    );
  });

  await r.ok("meta_event_log accepts lead_submitted and every old type", async () => {
    for (const t of [
      "view_content", "initiate_checkout", "lead", "purchase", "cancelled_lead",
      "config_health", "emq_check", "pixel_load_failure", "dataset_resend", "lead_submitted",
    ]) {
      await db.query(`insert into public.meta_event_log (event_type, event_id, state) values ($1, 'e', 'success')`, [t]);
    }
    return r.equal(Number(await scalar(db, `select count(*) from public.meta_event_log`)), 10);
  });

  await r.fails(
    "meta_event_log still refuses an unknown type",
    () => db.query(`insert into public.meta_event_log (event_type, event_id, state) values ('nope', 'e', 'success')`),
    "check constraint",
  );

  await r.ok("anon and authenticated cannot read the ledger (RLS on, no policies)", async () => {
    const rls = await scalar(db, `select relrowsecurity from pg_class where oid = 'public.meta_lead_submitted'::regclass`);
    const policies = Number(await scalar(db, `select count(*) from pg_policies where tablename = 'meta_lead_submitted'`));
    return r.equal([rls, policies], [true, 0]);
  });

  await r.ok("re-running 077 is a no-op that keeps the rows", async () => {
    await db.exec(readMigration("077_meta_lead_submitted.sql"));
    return r.equal(Number(await scalar(db, `select count(*) from public.meta_lead_submitted`)), 2);
  });

  await db.close();
  return r.results;
}
