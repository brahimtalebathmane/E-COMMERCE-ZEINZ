import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCampaignDailySpend } from "@/lib/meta/marketing-api";
import { dayKey, daysBetween, shiftDateKey } from "@/lib/analytics/daily-profit";

/** Avoid hammering the Marketing API on rapid dashboard reloads. */
const STALE_TTL_MS = 10 * 60 * 1000;
/** Meta may retroactively revise recent days' spend; keep this trailing window fresh, not just "today". */
const RECENT_WINDOW_DAYS = 4;
/** One-time cap on how far back a newly-linked campaign's history is backfilled. */
export const BACKFILL_CAP_DAYS = 90;
/** How far back `ensureFreshAdSpend` looks for a day with NO row at all (a gap
 *  from a quiet week where nobody opened the dashboard within RECENT_WINDOW_DAYS). */
const GAP_BACKFILL_WINDOW_DAYS = 90;

export type SyncResult =
  | {
      ok: true;
      /** Products with a linked campaign for which Meta returned literally no
       *  data anywhere in the window (not even a zero) — their days were left
       *  absent rather than written as a confident zero, so the month stays
       *  re-syncable on a later visit (see A13). */
      incompleteProductIds: string[];
    }
  | { ok: false; error: string };

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

/**
 * Refreshes `product_ad_spend_daily` for the given products over one explicit
 * date window, in a SINGLE batched Marketing API call covering every linked
 * campaign across all of them together. Overwrites (not merges) every day in
 * the window for a product Meta actually reported data for — including days
 * Meta reports as 0 spend — so re-running this is always idempotent and never
 * double-counts. A product Meta reported NOTHING for anywhere in the window
 * (campaign predates linking, outside retention, etc.) gets no rows written
 * at all, rather than a confident zero that would freeze it forever (A13).
 */
export async function syncProductAdSpend(
  supabase: SupabaseClient,
  params: { productIds: string[]; sinceISODate: string; untilISODate: string },
): Promise<SyncResult> {
  const productIds = [...new Set(params.productIds.filter(Boolean))];
  if (productIds.length === 0) return { ok: true, incompleteProductIds: [] };

  const { data: campaignRows, error: campaignErr } = await supabase
    .from("product_ad_campaigns")
    .select("product_id, meta_campaign_id")
    .in("product_id", productIds);

  if (campaignErr) {
    console.error("[ad-spend-sync] failed to load product_ad_campaigns", campaignErr.message);
    return { ok: false, error: campaignErr.message };
  }

  const campaigns = campaignRows ?? [];
  if (campaigns.length === 0) return { ok: true, incompleteProductIds: [] };

  const campaignToProduct = new Map<string, string>();
  for (const row of campaigns) {
    campaignToProduct.set(String(row.meta_campaign_id), String(row.product_id));
  }

  const mruPerUnitByCurrency = await loadCurrencyRates(supabase);

  const fetchResult = await fetchCampaignDailySpend({
    campaignIds: [...campaignToProduct.keys()],
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    mruPerUnitByCurrency,
  });

  if (!fetchResult.ok) {
    console.error("[ad-spend-sync] Meta Insights fetch failed", {
      reason: fetchResult.reason,
      detail: fetchResult.detail,
    });
    return { ok: false, error: fetchResult.detail ?? fetchResult.reason };
  }

  const productDayAmounts = new Map<string, { amountMRU: number; sourceAmount: number; sourceCurrency: string }>();
  const productsWithAnyData = new Set<string>();
  for (const [campaignId, byDate] of fetchResult.data) {
    const productId = campaignToProduct.get(campaignId);
    if (!productId) continue;
    for (const [date, entry] of byDate) {
      productsWithAnyData.add(productId);
      const key = `${productId}|${date}`;
      const existing = productDayAmounts.get(key);
      productDayAmounts.set(key, {
        amountMRU: (existing?.amountMRU ?? 0) + entry.amountMRU,
        sourceAmount: (existing?.sourceAmount ?? 0) + entry.sourceAmount,
        sourceCurrency: entry.sourceCurrency,
      });
    }
  }

  const productsWithCampaigns = new Set(campaignToProduct.values());
  const incompleteProductIds = [...productsWithCampaigns].filter((pid) => !productsWithAnyData.has(pid));

  // Write every day in the window for a product Meta reported ANY data for
  // (0 when a specific day had none) — a full reset of the window, not a
  // merge. Products with NO data anywhere in the window get no rows at all,
  // so the month stays re-syncable instead of freezing at a confident zero.
  const nowIso = new Date().toISOString();
  const upsertRows: {
    product_id: string;
    date: string;
    amount: number;
    source_amount: number | null;
    source_currency: string | null;
    fetched_at: string;
  }[] = [];
  let cursor = params.sinceISODate;
  while (cursor <= params.untilISODate) {
    for (const productId of productsWithAnyData) {
      const key = `${productId}|${cursor}`;
      const entry = productDayAmounts.get(key);
      upsertRows.push({
        product_id: productId,
        date: cursor,
        amount: entry?.amountMRU ?? 0,
        source_amount: entry?.sourceAmount ?? 0,
        source_currency: entry?.sourceCurrency ?? fetchResult.accountCurrency,
        fetched_at: nowIso,
      });
    }
    cursor = shiftDateKey(cursor, 1);
  }

  if (upsertRows.length === 0) return { ok: true, incompleteProductIds };

  const { error: upsertErr } = await supabase
    .from("product_ad_spend_daily")
    .upsert(upsertRows, { onConflict: "product_id,date" });

  if (upsertErr) {
    console.error("[ad-spend-sync] failed to upsert product_ad_spend_daily", upsertErr.message);
    return { ok: false, error: upsertErr.message };
  }

  return { ok: true, incompleteProductIds };
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

  const { data: campaignRows, error: campaignErr } = await supabase
    .from("product_ad_campaigns")
    .select("product_id")
    .in("product_id", productIds);

  if (campaignErr) {
    console.error("[ad-spend-sync] failed to check linked campaigns", campaignErr.message);
    return { refreshed: false, lastError: campaignErr.message };
  }

  const productsWithCampaigns = [...new Set((campaignRows ?? []).map((r) => String(r.product_id)))];
  if (productsWithCampaigns.length === 0) return { refreshed: false };

  const todayKey = dayKey(new Date());
  const windowStart = shiftDateKey(todayKey, -(RECENT_WINDOW_DAYS - 1));
  const ttlCutoffIso = new Date(Date.now() - STALE_TTL_MS).toISOString();

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
  const gapWindowStart = shiftDateKey(todayKey, -(GAP_BACKFILL_WINDOW_DAYS - 1));
  const createdByProduct = new Map(products.map((p) => [p.id, p.createdAt]));
  const { data: existingDateRows, error: existingErr } = await supabase
    .from("product_ad_spend_daily")
    .select("product_id, date")
    .in("product_id", productsWithCampaigns)
    .gte("date", gapWindowStart)
    .lte("date", todayKey);

  const gapProductIds: string[] = [];
  if (!existingErr) {
    const datesByProduct = new Map<string, Set<string>>();
    for (const row of existingDateRows ?? []) {
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

  let refreshed = false;
  let lastError: string | undefined;

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

  return { refreshed, lastError };
}

/**
 * One-time backfill window for a newly-linked campaign: from the product's
 * creation date, capped at `BACKFILL_CAP_DAYS` back from today. A campaign
 * that was already spending for longer than that before being linked here
 * will understate lifetime spend for the pre-link stretch — a disclosed,
 * deliberate trade-off against an unbounded (slow, rate-limit-risky) historical pull.
 */
export function computeBackfillWindow(productCreatedAtIso: string): { sinceISODate: string; untilISODate: string } {
  const todayKey = dayKey(new Date());
  const createdKey = dayKey(productCreatedAtIso) || todayKey;
  const capKey = shiftDateKey(todayKey, -(BACKFILL_CAP_DAYS - 1));
  const sinceISODate = createdKey > capKey ? createdKey : capKey;
  return { sinceISODate, untilISODate: todayKey };
}
