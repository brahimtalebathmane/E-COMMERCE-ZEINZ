import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAccountDailySpend,
  fetchAdSetDailySpend,
  fetchCampaignDailySpend,
  type CampaignDailySpend,
  type CampaignDailySpendEntry,
} from "@/lib/meta/marketing-api";
import { dayKey, daysBetween, shiftDateKey } from "@/lib/analytics/daily-profit";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/** Avoid hammering the Marketing API on rapid dashboard reloads. */
const STALE_TTL_MS = 10 * 60 * 1000;
/** Meta may retroactively revise recent days' spend; keep this trailing window fresh, not just "today". */
const RECENT_WINDOW_DAYS = 4;
/** One-time cap on how far back a newly-linked campaign's history is backfilled. */
export const BACKFILL_CAP_DAYS = 90;
/** How far back `ensureFreshAdSpend` looks for a day with NO row at all (a gap
 *  from a quiet week where nobody opened the dashboard within RECENT_WINDOW_DAYS). */
export const GAP_BACKFILL_WINDOW_DAYS = 90;

export type SyncResult =
  | {
      ok: true;
      /** Products with a linked campaign or ad set for which Meta returned
       *  literally no data anywhere in the window (not even a zero) — their
       *  days were left absent rather than written as a confident zero, so the
       *  month stays re-syncable on a later visit (see A13). */
      incompleteProductIds: string[];
    }
  | { ok: false; error: string };

export type AdLinks = {
  campaigns: { product_id: string; meta_campaign_id: string }[];
  adSets: { product_id: string; meta_adset_id: string; meta_campaign_id: string }[];
};

/**
 * Every campaign and ad set linked to the given products. A product "has ad
 * links" when it appears in either list — that is what decides whether it is
 * synced at all (stale check, gap backfill, month sync).
 */
export async function loadAdLinks(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{ ok: true; links: AdLinks } | { ok: false; error: string }> {
  if (productIds.length === 0) return { ok: true, links: { campaigns: [], adSets: [] } };
  const [campaignsRes, adSetsRes] = await Promise.all([
    supabase.from("product_ad_campaigns").select("product_id, meta_campaign_id").in("product_id", productIds),
    supabase
      .from("product_ad_sets")
      .select("product_id, meta_adset_id, meta_campaign_id")
      .in("product_id", productIds),
  ]);
  if (campaignsRes.error) return { ok: false, error: campaignsRes.error.message };
  if (adSetsRes.error) return { ok: false, error: adSetsRes.error.message };
  return {
    ok: true,
    links: {
      campaigns: (campaignsRes.data ?? []).map((r) => ({
        product_id: String(r.product_id),
        meta_campaign_id: String(r.meta_campaign_id),
      })),
      adSets: (adSetsRes.data ?? []).map((r) => ({
        product_id: String(r.product_id),
        meta_adset_id: String(r.meta_adset_id),
        meta_campaign_id: String(r.meta_campaign_id),
      })),
    },
  };
}

export function linkedProductIds(links: AdLinks): string[] {
  return [...new Set([...links.campaigns.map((c) => c.product_id), ...links.adSets.map((s) => s.product_id)])];
}

async function loadCurrencyRates(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from("currency_rates").select("code, mru_per_unit");
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const code = String(r.code ?? "").trim().toUpperCase();
    const rate = Number(r.mru_per_unit);
    if (code && Number.isFinite(rate) && rate > 0) map.set(code, rate);
  }
  return map;
}

type SpendRow = {
  product_id: string;
  date: string;
  amount: number;
  source_amount: number | null;
  source_currency: string | null;
  fetched_at: string;
};

/**
 * Pure: turns the campaign-level and ad-set-level Insights results into
 * product_ad_spend_daily rows. A product's day = its linked campaigns' spend
 * + its linked ad sets' spend. Every day of the window is written for a
 * product Meta reported ANY data for (0 on a day without data — a full reset,
 * not a merge); a product with no data at all gets no rows (A13).
 */
export function buildProductSpendRows(params: {
  campaignToProduct: Map<string, string>;
  adSetToProduct: Map<string, string>;
  campaignData: CampaignDailySpend;
  adSetData: CampaignDailySpend;
  accountCurrency: string | null;
  sinceISODate: string;
  untilISODate: string;
  nowIso: string;
}): { rows: SpendRow[]; incompleteProductIds: string[] } {
  const productDay = new Map<string, CampaignDailySpendEntry>();
  const productsWithAnyData = new Set<string>();

  const fold = (data: CampaignDailySpend, toProduct: Map<string, string>) => {
    for (const [entityId, byDate] of data) {
      const productId = toProduct.get(entityId);
      if (!productId) continue;
      for (const [date, entry] of byDate) {
        productsWithAnyData.add(productId);
        const key = `${productId}|${date}`;
        const existing = productDay.get(key);
        productDay.set(key, {
          amountMRU: (existing?.amountMRU ?? 0) + entry.amountMRU,
          sourceAmount: (existing?.sourceAmount ?? 0) + entry.sourceAmount,
          sourceCurrency: entry.sourceCurrency,
        });
      }
    }
  };
  fold(params.campaignData, params.campaignToProduct);
  fold(params.adSetData, params.adSetToProduct);

  const linked = new Set([...params.campaignToProduct.values(), ...params.adSetToProduct.values()]);
  const incompleteProductIds = [...linked].filter((pid) => !productsWithAnyData.has(pid));

  const rows: SpendRow[] = [];
  let cursor = params.sinceISODate;
  while (cursor <= params.untilISODate) {
    for (const productId of productsWithAnyData) {
      const entry = productDay.get(`${productId}|${cursor}`);
      rows.push({
        product_id: productId,
        date: cursor,
        amount: entry?.amountMRU ?? 0,
        source_amount: entry?.sourceAmount ?? 0,
        source_currency: entry?.sourceCurrency ?? params.accountCurrency,
        fetched_at: params.nowIso,
      });
    }
    cursor = shiftDateKey(cursor, 1);
  }
  return { rows, incompleteProductIds };
}

/** Writes the account's total for every day of the window (0 on days Meta reported nothing). */
async function writeAccountSpend(
  supabase: SupabaseClient,
  params: {
    adAccountId: string;
    data: Map<string, CampaignDailySpendEntry>;
    accountCurrency: string | null;
    sinceISODate: string;
    untilISODate: string;
    nowIso: string;
  },
): Promise<string | null> {
  const rows: {
    ad_account_id: string;
    date: string;
    amount: number;
    source_amount: number;
    source_currency: string | null;
    fetched_at: string;
  }[] = [];
  let cursor = params.sinceISODate;
  while (cursor <= params.untilISODate) {
    const entry = params.data.get(cursor);
    rows.push({
      ad_account_id: params.adAccountId,
      date: cursor,
      amount: entry?.amountMRU ?? 0,
      source_amount: entry?.sourceAmount ?? 0,
      source_currency: entry?.sourceCurrency ?? params.accountCurrency,
      fetched_at: params.nowIso,
    });
    cursor = shiftDateKey(cursor, 1);
  }
  if (rows.length === 0) return null;
  const { error } = await supabase.from("ad_account_spend_daily").upsert(rows, { onConflict: "ad_account_id,date" });
  return error ? error.message : null;
}

/**
 * Refreshes `product_ad_spend_daily` for the given products over one explicit
 * date window. One sync = at most three batched Marketing API requests, run
 * together: every linked campaign in one request (level=campaign), every
 * linked ad set in one request (level=adset — Insights filtering is AND-only,
 * so the two can't share a request), and the account's total (level=account,
 * for the unattributed-spend check).
 *
 * ALL OR NOTHING: if any of them fails or is truncated, nothing is written and
 * the cached rows stay. Writing the campaign half alone would overwrite each
 * product's window with only part of its spend — the exact undercount this
 * exists to prevent.
 *
 * Overwrites (not merges) every day in the window for a product Meta reported
 * data for, so re-running is idempotent and never double-counts. A product
 * Meta reported NOTHING for gets no rows (A13).
 */
export async function syncProductAdSpend(
  supabase: SupabaseClient,
  params: { productIds: string[]; sinceISODate: string; untilISODate: string },
): Promise<SyncResult> {
  const productIds = [...new Set(params.productIds.filter(Boolean))];
  if (productIds.length === 0) return { ok: true, incompleteProductIds: [] };

  const linksRes = await loadAdLinks(supabase, productIds);
  if (!linksRes.ok) {
    console.error("[ad-spend-sync] failed to load ad links", linksRes.error);
    return { ok: false, error: linksRes.error };
  }
  const { campaigns, adSets } = linksRes.links;
  if (campaigns.length === 0 && adSets.length === 0) return { ok: true, incompleteProductIds: [] };

  const campaignToProduct = new Map<string, string>();
  for (const row of campaigns) campaignToProduct.set(row.meta_campaign_id, row.product_id);

  // The database refuses a campaign linked both whole and through its ad sets
  // (078 trigger). Defence in depth: if it ever happened, count the campaign
  // once (whole) and ignore its ad sets rather than double-count.
  const adSetToProduct = new Map<string, string>();
  for (const row of adSets) {
    if (campaignToProduct.has(row.meta_campaign_id)) {
      console.error("[ad-spend-sync] ad set ignored: its campaign is also linked whole", {
        adSetId: row.meta_adset_id,
        campaignId: row.meta_campaign_id,
      });
      continue;
    }
    adSetToProduct.set(row.meta_adset_id, row.product_id);
  }

  const mruPerUnitByCurrency = await loadCurrencyRates(supabase);
  const window = { sinceISODate: params.sinceISODate, untilISODate: params.untilISODate, mruPerUnitByCurrency };

  const [campaignRes, adSetRes, accountRes] = await Promise.all([
    fetchCampaignDailySpend({ ...window, campaignIds: [...campaignToProduct.keys()] }),
    fetchAdSetDailySpend({ ...window, adSetIds: [...adSetToProduct.keys()] }),
    fetchAccountDailySpend(window),
  ]);

  for (const [label, res] of [
    ["campaign", campaignRes],
    ["adset", adSetRes],
    ["account", accountRes],
  ] as const) {
    if (!res.ok) {
      console.error("[ad-spend-sync] Meta Insights fetch failed — nothing written", {
        level: label,
        reason: res.reason,
        detail: res.detail,
      });
      return { ok: false, error: `${label}: ${res.detail ?? res.reason}` };
    }
  }
  if (!campaignRes.ok || !adSetRes.ok || !accountRes.ok) return { ok: false, error: "unreachable" };

  const nowIso = new Date().toISOString();
  const { rows, incompleteProductIds } = buildProductSpendRows({
    campaignToProduct,
    adSetToProduct,
    campaignData: campaignRes.data,
    adSetData: adSetRes.data,
    accountCurrency: campaignRes.accountCurrency ?? adSetRes.accountCurrency ?? accountRes.accountCurrency,
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    nowIso,
  });

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("product_ad_spend_daily")
      .upsert(rows, { onConflict: "product_id,date" });
    if (upsertErr) {
      console.error("[ad-spend-sync] failed to upsert product_ad_spend_daily", upsertErr.message);
      return { ok: false, error: upsertErr.message };
    }
  }

  const accountErr = await writeAccountSpend(supabase, {
    adAccountId: accountRes.adAccountId,
    data: accountRes.data,
    accountCurrency: accountRes.accountCurrency,
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    nowIso,
  });
  if (accountErr) {
    // Product rows are already correct; only the unattributed check lags.
    console.error("[ad-spend-sync] failed to upsert ad_account_spend_daily", accountErr);
  }

  return { ok: true, incompleteProductIds };
}

/** Refreshes only the account total (no product rows) — used when the account rows have gaps. */
async function syncAccountSpendOnly(
  supabase: SupabaseClient,
  window: { sinceISODate: string; untilISODate: string },
): Promise<string | null> {
  const mruPerUnitByCurrency = await loadCurrencyRates(supabase);
  const res = await fetchAccountDailySpend({ ...window, mruPerUnitByCurrency });
  if (!res.ok) return res.detail ?? res.reason;
  return writeAccountSpend(supabase, {
    adAccountId: res.adAccountId,
    data: res.data,
    accountCurrency: res.accountCurrency,
    ...window,
    nowIso: new Date().toISOString(),
  });
}

/**
 * On-page-load entry point: refreshes only products whose recent-window ad
 * spend is stale (missing or older than the TTL), and does so with ONE
 * batched sync call for every stale product together — so API usage stays low
 * regardless of reload frequency or how many products are linked. Never
 * throws; on failure the caller keeps whatever was already cached and can
 * show a "the last successful refresh was at ..." note via `lastError`.
 */
export async function ensureFreshAdSpend(
  supabase: SupabaseClient,
  products: { id: string; createdAt: string }[],
): Promise<{ refreshed: boolean; lastError?: string }> {
  const productIds = products.map((p) => p.id);
  if (productIds.length === 0) return { refreshed: false };

  const linksRes = await loadAdLinks(supabase, productIds);
  if (!linksRes.ok) {
    console.error("[ad-spend-sync] failed to check linked campaigns / ad sets", linksRes.error);
    return { refreshed: false, lastError: linksRes.error };
  }

  // A product "has ad links" with a linked campaign OR a linked ad set.
  const productsWithCampaigns = linkedProductIds(linksRes.links);

  const todayKey = dayKey(new Date());
  const windowStart = shiftDateKey(todayKey, -(RECENT_WINDOW_DAYS - 1));
  const ttlCutoffIso = new Date(Date.now() - STALE_TTL_MS).toISOString();
  const gapWindowStart = shiftDateKey(todayKey, -(GAP_BACKFILL_WINDOW_DAYS - 1));

  let refreshed = false;
  let lastError: string | undefined;

  if (productsWithCampaigns.length > 0) {
    const { data: freshRows, error: freshErr } = await supabase
      .from("product_ad_spend_daily")
      .select("product_id, fetched_at")
      .in("product_id", productsWithCampaigns)
      .gte("date", windowStart)
      .gte("fetched_at", ttlCutoffIso);

    if (freshErr) {
      console.error("[ad-spend-sync] failed to check ad-spend freshness", freshErr.message);
      return { refreshed: false, lastError: freshErr.message };
    }

    const freshProductIds = new Set((freshRows ?? []).map((r) => String(r.product_id)));
    const staleProductIds = productsWithCampaigns.filter((id) => !freshProductIds.has(id));

    // A12: a product refreshed only within its trailing RECENT_WINDOW_DAYS
    // never gets its OLDER gaps backfilled — if nobody opens the dashboard for
    // a week, the days outside that trailing window are never fetched again and
    // stay at implicit zero forever. Look for any day in the last
    // GAP_BACKFILL_WINDOW_DAYS with literally no row for a product whose
    // campaign is old enough to have one, and fold those into a second,
    // separate sync (capped at one extra batched call per page load).
    const createdByProduct = new Map(products.map((p) => [p.id, p.createdAt]));
    // 90 days × every linked product passes 1000 rows quickly; an unpaginated
    // read was cut at PostgREST's cap, so products looked like they had gaps
    // and were re-synced from Meta on every dashboard load.
    const { rows: existingDateRows, error: existingErr } = await fetchAllRows<{
      product_id: string;
      date: string;
    }>(
      () =>
        supabase
          .from("product_ad_spend_daily")
          .select("product_id, date")
          .in("product_id", productsWithCampaigns)
          .gte("date", gapWindowStart)
          .lte("date", todayKey) as never,
      ["date", "product_id"],
    );

    const gapProductIds: string[] = [];
    if (!existingErr) {
      const datesByProduct = new Map<string, Set<string>>();
      for (const row of existingDateRows) {
        const pid = String(row.product_id);
        const set = datesByProduct.get(pid) ?? new Set<string>();
        set.add(String(row.date));
        datesByProduct.set(pid, set);
      }
      for (const pid of productsWithCampaigns) {
        const createdKey = createdByProduct.get(pid) ? dayKey(createdByProduct.get(pid) as string) : "";
        const expectedStart = createdKey && createdKey > gapWindowStart ? createdKey : gapWindowStart;
        const expectedDays = daysBetween(expectedStart, todayKey) + 1;
        const actualDays = datesByProduct.get(pid)?.size ?? 0;
        if (actualDays < expectedDays) gapProductIds.push(pid);
      }
    }

    const staleSet = new Set(staleProductIds);
    const gapOnlyProductIds = gapProductIds.filter((id) => !staleSet.has(id));

    if (staleProductIds.length > 0) {
      const result = await syncProductAdSpend(supabase, {
        productIds: staleProductIds,
        sinceISODate: windowStart,
        untilISODate: todayKey,
      });
      if (result.ok) refreshed = true;
      else lastError = result.error;
    }

    if (gapOnlyProductIds.length > 0) {
      const result = await syncProductAdSpend(supabase, {
        productIds: gapOnlyProductIds,
        sinceISODate: gapWindowStart,
        untilISODate: todayKey,
      });
      if (result.ok) refreshed = true;
      else lastError = result.error ?? lastError;
    }
  }

  // The account total must keep up even when no product is linked (or when
  // every product was fresh): it is what reveals spend nobody linked. Fill
  // missing days of the gap window, or refresh the recent window once the TTL
  // has passed — one level=account request, only when needed.
  const accountErr = await ensureFreshAccountSpend(supabase, { todayKey, windowStart, gapWindowStart, ttlCutoffIso });
  if (accountErr) lastError = lastError ?? accountErr;

  return { refreshed, lastError };
}

async function ensureFreshAccountSpend(
  supabase: SupabaseClient,
  w: { todayKey: string; windowStart: string; gapWindowStart: string; ttlCutoffIso: string },
): Promise<string | null> {
  const { rows, error } = await fetchAllRows<{ ad_account_id: string; date: string; fetched_at: string }>(
    () =>
      supabase
        .from("ad_account_spend_daily")
        .select("ad_account_id, date, fetched_at")
        .gte("date", w.gapWindowStart)
        .lte("date", w.todayKey) as never,
    ["date", "ad_account_id"],
  );
  if (error) return error;
  const dates = new Set(rows.map((r) => String(r.date)));
  const expected = daysBetween(w.gapWindowStart, w.todayKey) + 1;
  if (dates.size < expected) return syncAccountSpendOnly(supabase, { sinceISODate: w.gapWindowStart, untilISODate: w.todayKey });
  const recentFresh = rows.some((r) => String(r.date) >= w.windowStart && String(r.fetched_at) >= w.ttlCutoffIso);
  if (!recentFresh) return syncAccountSpendOnly(supabase, { sinceISODate: w.windowStart, untilISODate: w.todayKey });
  return null;
}

/**
 * One-time backfill window for a newly-linked campaign or ad set: from the
 * product's creation date, capped at `BACKFILL_CAP_DAYS` back from today. A
 * campaign that was already spending for longer than that before being linked
 * here will understate lifetime spend for the pre-link stretch — a disclosed,
 * deliberate trade-off against an unbounded (slow, rate-limit-risky) historical pull.
 */
export function computeBackfillWindow(productCreatedAtIso: string): { sinceISODate: string; untilISODate: string } {
  const todayKey = dayKey(new Date());
  const createdKey = dayKey(productCreatedAtIso) || todayKey;
  const capKey = shiftDateKey(todayKey, -(BACKFILL_CAP_DAYS - 1));
  const sinceISODate = createdKey > capKey ? createdKey : capKey;
  return { sinceISODate, untilISODate: todayKey };
}
