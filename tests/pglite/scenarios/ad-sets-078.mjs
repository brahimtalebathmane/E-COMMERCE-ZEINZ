// 078: product_ad_sets + campaign/ad set exclusion trigger + ad_account_spend_daily.
import { createReporter, freshDb, insertProduct, readMigration, scalar } from "../harness.mjs";

const linkCampaign = (db, productId, campaignId) =>
  db.query(`insert into public.product_ad_campaigns (product_id, meta_campaign_id) values ($1, $2)`, [
    productId,
    campaignId,
  ]);
const linkAdSet = (db, productId, adSetId, campaignId) =>
  db.query(
    `insert into public.product_ad_sets (product_id, meta_adset_id, meta_campaign_id, label) values ($1, $2, $3, 'as')`,
    [productId, adSetId, campaignId],
  );

export default async function run() {
  const r = createReporter("078 — ad set links, exclusion, account spend");

  // Seed a whole-campaign link BEFORE 078, as production has (27 rows).
  let preProduct;
  const db = await freshDb({
    beforeEach: async (file, d) => {
      if (file === "078_product_ad_sets.sql") {
        preProduct = await insertProduct(d, { slug: "pre-078", iso: "MR" });
        await linkCampaign(d, preProduct, "100");
      }
    },
  });
  const p1 = await insertProduct(db, { slug: "as-1", iso: "MR" });
  const p2 = await insertProduct(db, { slug: "as-2", iso: "MR" });
  const p3 = await insertProduct(db, { slug: "as-3", iso: "MR" });

  await r.ok("existing whole-campaign links survive 078 untouched", async () =>
    r.equal(Number(await scalar(db, `select count(*) from public.product_ad_campaigns`)), 1),
  );

  await r.ok("three ad sets of one campaign link to three products", async () => {
    await linkAdSet(db, p1, "901", "900");
    await linkAdSet(db, p2, "902", "900");
    await linkAdSet(db, p3, "903", "900");
    return r.equal(Number(await scalar(db, `select count(*) from public.product_ad_sets where meta_campaign_id = '900'`)), 3);
  });

  await r.ok("a product can have several ad sets (test, then expansion)", async () => {
    await linkAdSet(db, p1, "911", "910");
    return r.equal(Number(await scalar(db, `select count(*) from public.product_ad_sets where product_id = $1`, [p1])), 2);
  });

  await r.fails("the same ad set can't be linked to a second product", () => linkAdSet(db, p2, "901", "900"), "duplicate key");

  await r.fails(
    "campaign → ad set: linking a whole campaign whose ad sets are linked is refused",
    () => linkCampaign(db, p1, "900"),
    "AD_LINK_ADSETS_LINKED",
  );

  await r.fails(
    "ad set → campaign: linking an ad set of a campaign linked whole is refused",
    () => linkAdSet(db, p1, "101", "100"),
    "AD_LINK_CAMPAIGN_LINKED_WHOLE",
  );

  await r.fails(
    "moving a campaign link onto a campaign with linked ad sets is refused (update)",
    () => db.query(`update public.product_ad_campaigns set meta_campaign_id = '900' where meta_campaign_id = '100'`),
    "AD_LINK_ADSETS_LINKED",
  );

  await r.fails(
    "moving an ad set link onto a campaign linked whole is refused (update)",
    () => db.query(`update public.product_ad_sets set meta_campaign_id = '100' where meta_adset_id = '911'`),
    "AD_LINK_CAMPAIGN_LINKED_WHOLE",
  );

  await r.ok("after unlinking all its ad sets, the campaign can be linked whole", async () => {
    await db.query(`delete from public.product_ad_sets where meta_campaign_id = '900'`);
    await linkCampaign(db, p2, "900");
    return r.equal(Number(await scalar(db, `select count(*) from public.product_ad_campaigns where meta_campaign_id = '900'`)), 1);
  });

  await r.fails("ids must be digits", () => linkAdSet(db, p1, "abc", "930"), "check constraint");

  await r.ok("trigger function is security definer, not executable by anon/authenticated", async () => {
    const definer = await scalar(db, `select prosecdef from pg_proc where proname = 'enforce_ad_link_exclusion'`);
    const anon = await scalar(db, `select has_function_privilege('anon', 'public.enforce_ad_link_exclusion()', 'EXECUTE')`);
    const auth = await scalar(db, `select has_function_privilege('authenticated', 'public.enforce_ad_link_exclusion()', 'EXECUTE')`);
    return r.equal([definer, anon, auth], [true, false, false]);
  });

  await r.ok("RLS on both new tables; product_ad_sets mirrors product_ad_campaigns' policies", async () => {
    const rls = await scalar(
      db,
      `select bool_and(relrowsecurity) from pg_class where oid in ('public.product_ad_sets'::regclass, 'public.ad_account_spend_daily'::regclass)`,
    );
    const cmds = await scalar(db, `select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'product_ad_sets'`);
    const accountCmds = await scalar(db, `select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'ad_account_spend_daily'`);
    return r.equal([rls, cmds, accountCmds], [true, "DELETE,INSERT,SELECT", "SELECT"]);
  });

  await r.ok("anon has no table privileges on the new tables", async () => {
    const anonSets = await scalar(db, `select has_table_privilege('anon', 'public.product_ad_sets', 'SELECT')`);
    const anonAcct = await scalar(db, `select has_table_privilege('anon', 'public.ad_account_spend_daily', 'SELECT')`);
    const authWrite = await scalar(db, `select has_table_privilege('authenticated', 'public.ad_account_spend_daily', 'INSERT')`);
    return r.equal([anonSets, anonAcct, authWrite], [false, false, false]);
  });

  await r.ok("ad_account_spend_daily: one row per account and day, upsert overwrites", async () => {
    const up = (amount) =>
      db.query(
        `insert into public.ad_account_spend_daily (ad_account_id, date, amount, source_amount, source_currency)
         values ('123', '2026-11-10', $1, $2, 'USD')
         on conflict (ad_account_id, date) do update set amount = excluded.amount, source_amount = excluded.source_amount`,
        [amount * 43, amount],
      );
    await up(2.15);
    await up(25.03);
    return r.equal(await scalar(db, `select source_amount::text from public.ad_account_spend_daily`), "25.03");
  });

  await r.ok("unlink history accepts an ad set id", async () => {
    await db.query(
      `insert into public.product_ad_campaign_unlinks (product_id, meta_campaign_id, meta_adset_id) values ($1, '900', '901')`,
      [p1],
    );
    return r.equal(Number(await scalar(db, `select count(*) from public.product_ad_campaign_unlinks where meta_adset_id = '901'`)), 1);
  });

  await r.ok("deleting a product removes its ad set links (cascade)", async () => {
    await db.query(`delete from public.product_ad_sets where product_id <> $1`, [p1]);
    const before = Number(await scalar(db, `select count(*) from public.product_ad_sets where product_id = $1`, [p1]));
    await db.query(`alter table public.products disable trigger user`);
    await db.query(`delete from public.product_ad_campaign_unlinks where product_id = $1`, [p1]);
    await db.query(`delete from public.products where id = $1`, [p1]);
    await db.query(`alter table public.products enable trigger user`);
    const after = Number(await scalar(db, `select count(*) from public.product_ad_sets where product_id = $1`, [p1]));
    return r.equal([before, after], [1, 0]);
  });

  await r.ok("re-running 078 is a no-op that keeps the rows", async () => {
    await linkAdSet(db, p3, "921", "920");
    await db.exec(readMigration("078_product_ad_sets.sql"));
    const sets = Number(await scalar(db, `select count(*) from public.product_ad_sets`));
    const acct = Number(await scalar(db, `select count(*) from public.ad_account_spend_daily`));
    return r.equal([sets, acct], [1, 1]);
  });

  await r.fails(
    "the exclusion still holds after a re-run",
    () => linkCampaign(db, p2, "920"),
    "AD_LINK_ADSETS_LINKED",
  );

  await db.close();
  return r.results;
}
