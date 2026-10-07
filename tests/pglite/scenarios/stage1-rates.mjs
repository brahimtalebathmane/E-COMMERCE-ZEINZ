// 070: SAR/KWD rates — inserted once, never overwritten.
import { createReporter, freshDb, readMigration, scalar } from "../harness.mjs";

export default async function run() {
  const r = createReporter("070 — SAR/KWD exchange rates");
  const db = await freshDb();
  await r.ok("SAR and KWD present with the chosen values", async () =>
    r.equal(
      await scalar(db, `select string_agg(code || '=' || mru_per_unit::text, ',' order by code) from public.currency_rates`),
      "KWD=140,MRU=1,SAR=11.47,USD=43",
    ),
  );
  await r.ok("re-run is a no-op", async () => {
    await db.exec(readMigration("070_currency_rates_sar_kwd.sql"));
    return r.equal(Number(await scalar(db, `select count(*) from public.currency_rates`)), 4);
  });
  await r.fails(
    "refuses to run when SAR already has another rate",
    async () => {
      await db.exec(`update public.currency_rates set mru_per_unit = 12 where code = 'SAR'`);
      await db.exec(readMigration("070_currency_rates_sar_kwd.sql"));
    },
    "already has a different rate",
  );
  await db.close();
  return r.results;
}
