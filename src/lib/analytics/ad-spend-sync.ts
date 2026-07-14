import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCampaignDailySpend } from "@/lib/meta/marketing-api";
import { dayKey, shiftDateKey } from "@/lib/analytics/daily-profit";

/** Avoid hammering the Marketing API on rapid dashboard reloads. */
const STALE_TTL_MS = 10 * 60 * 1000;
/** Meta may retroactively revise recent days' spend; keep this trailing window fresh, not just "today". */
const RECENT_WINDOW_DAYS = 4;
/** One-time cap on how far back a newly-linked campaign's history is backfilled. */
export const BACKFILL_CAP_DAYS = 90;

export type SyncResult = { ok: boolean; error?: string };

/**
 * Refreshes `product_ad_spend_daily` for the given products over one explicit
 * date window, in a SINGLE batched Marketing API call covering every linked
 * campaign across all of them together. Overwrites (not merges) every day in
 * the window for a synced product — including days Meta reports as 0 spend —
 * so re-running this is always idempotent and never double-counts.
 */
export async function syncProductAdSpend(
  supabase: SupabaseClient,
  params: { productIds: string[]; sinceISODate: string; untilISODate: string },
): Promise<SyncResult> {
  const productIds = [...new Set(params.productIds.filter(Boolean))];
  if (productIds.length === 0) return { ok: true };

  const { data: campaignRows, error: campaignErr } = await supabase
    .from("product_ad_campaigns")
    .select("product_id, meta_campaign_id")
    .in("product_id", productIds);

  if (campaignErr) {
    console.error("[ad-spend-sync] failed to load product_ad_campaigns", campaignErr.message);
    return { ok: false, error: campaignErr.message };
  }

  const campaigns = campaignRows ?? [];
  if (campaigns.length === 0) return { ok: true };

  const campaignToProduct = new Map<string, string>();
  for (const row of campaigns) {
    campaignToProduct.set(String(row.meta_campaign_id), String(row.product_id));
  }

  const fetchResult = await fetchCampaignDailySpend({
    campaignIds: [...campaignToProduct.keys()],
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
  });

  if (!fetchResult.ok) {
    console.error("[ad-spend-sync] Meta Insights fetch failed", {
      reason: fetchResult.reason,
      detail: fetchResult.detail,
    });
    return { ok: false, error: fetchResult.detail ?? fetchResult.reason };
  }

  const productDayAmounts = new Map<string, number>();
  for (const [campaignId, byDate] of fetchResult.data) {
    const productId = campaignToProduct.get(campaignId);
    if (!productId) continue;
    for (const [date, amount] of byDate) {
      const key = `${productId}|${date}`;
      productDayAmounts.set(key, (productDayAmounts.get(key) ?? 0) + amount);
    }
  }

  // Write every day in the window for every synced product (0 when Meta
  // reported nothing), so this is a full reset of the window, not a merge.
  const nowIso = new Date().toISOString();
  const productsWithCampaigns = new Set(campaignToProduct.values());
  const upsertRows: { product_id: string; date: string; amount: number; fetched_at: string }[] = [];
  let cursor = params.sinceISODate;
  while (cursor <= params.untilISODate) {
    for (const productId of productsWithCampaigns) {
      const key = `${productId}|${cursor}`;
      upsertRows.push({
        product_id: productId,
        date: cursor,
        amount: productDayAmounts.get(key) ?? 0,
        fetched_at: nowIso,
      });
    }
    cursor = shiftDateKey(cursor, 1);
  }

  if (upsertRows.length === 0) return { ok: true };

  const { error: upsertErr } = await supabase
    .from("product_ad_spend_daily")
    .upsert(upsertRows, { onConflict: "product_id,date" });

  if (upsertErr) {
    console.error("[ad-spend-sync] failed to upsert product_ad_spend_daily", upsertErr.message);
    return { ok: false, error: upsertErr.message };
  }

  return { ok: true };
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
  if (staleProductIds.length === 0) return { refreshed: false };

  const result = await syncProductAdSpend(supabase, {
    productIds: staleProductIds,
    sinceISODate: windowStart,
    untilISODate: todayKey,
  });

  return { refreshed: result.ok, lastError: result.error };
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
