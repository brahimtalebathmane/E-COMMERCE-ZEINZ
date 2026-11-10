"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertInCountryScope, getCountryScope, requireCountryScope } from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { computeBackfillWindow, linkedProductIds, loadAdLinks, syncProductAdSpend } from "@/lib/analytics/ad-spend-sync";
import { dayKey, daysBetween } from "@/lib/analytics/daily-profit";
import { monthRange } from "@/lib/analytics/period";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { fetchAdSetInfo, listActiveAdSets } from "@/lib/meta/marketing-api";
import { adminAr } from "@/locales/admin-ar";
import type { LinkedCampaign } from "./data";

const t = adminAr.analytics;

/** The product name a row in a link table points to (embedded `products(name_ar)`). */
function embeddedProductName(value: unknown): string | null {
  const p = value as { name_ar?: string } | { name_ar?: string }[] | null;
  const name = Array.isArray(p) ? p[0]?.name_ar : p?.name_ar;
  return name ? String(name) : null;
}

/** Maps the 078 exclusion trigger's error to the owner-facing message. */
function exclusionTriggerMessage(message: string | undefined): string | null {
  if (!message) return null;
  if (message.includes("AD_LINK_CAMPAIGN_LINKED_WHOLE")) return t.adSetCampaignLinkedWhole.replace("{product}", "—");
  if (message.includes("AD_LINK_ADSETS_LINKED")) return t.campaignHasLinkedAdSets.replace("{product}", "—");
  return null;
}

export type LinkCampaignActionResult =
  | {
      ok: true;
      campaign: LinkedCampaign;
      /** Set when the campaign linked successfully but the initial backfill sync failed. */
      syncWarning?: string;
    }
  | { ok: false; error: string };

/**
 * Links a Meta ad campaign to a product for live ad-spend attribution, then
 * runs a one-time backfill sync (see `computeBackfillWindow`) so the new
 * campaign's spend appears in charts immediately instead of waiting for the
 * next page-load refresh. Linking still succeeds even if that sync fails —
 * the failure is surfaced separately via `syncWarning`.
 */
export async function linkAdCampaignAction(
  productId: string,
  metaCampaignId: string,
  label?: string | null,
): Promise<LinkCampaignActionResult> {
  const pid = productId?.trim();
  const campaignId = metaCampaignId?.trim();
  if (!pid) return { ok: false, error: "product_id is required." };
  if (!campaignId) return { ok: false, error: "Meta campaign id is required." };

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const scope = await requireCountryScope();
    const supabase = createServiceClient();

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, created_at, country_id")
      .eq("id", pid)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product) return { ok: false, error: "Product not found." };
    // Owned and affiliate products alike, but only in the selected market:
    // a tampered request can't attach spend to another country's product.
    assertInCountryScope(scope, product.country_id as string | null);

    // No double counting: a campaign whose ad sets are linked can't also be
    // linked whole (the 078 trigger enforces the same rule under concurrency).
    const { data: adSetOwner, error: adSetOwnerErr } = await supabase
      .from("product_ad_sets")
      .select("products(name_ar)")
      .eq("meta_campaign_id", campaignId)
      .limit(1)
      .maybeSingle();
    if (adSetOwnerErr) return { ok: false, error: adSetOwnerErr.message };
    if (adSetOwner) {
      return {
        ok: false,
        error: t.campaignHasLinkedAdSets.replace("{product}", embeddedProductName(adSetOwner.products) ?? "—"),
      };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("product_ad_campaigns")
      .insert({ product_id: pid, meta_campaign_id: campaignId, label: label?.trim() || null })
      .select("id, meta_campaign_id, label")
      .single();

    if (insertErr) {
      const exclusion = exclusionTriggerMessage(insertErr.message);
      if (exclusion) return { ok: false, error: exclusion };
      if (insertErr.code === "23505") {
        const { data: owner } = await supabase
          .from("product_ad_campaigns")
          .select("products(name_ar)")
          .eq("meta_campaign_id", campaignId)
          .maybeSingle();
        const ownerProduct = owner?.products as { name_ar?: string } | { name_ar?: string }[] | null;
        const ownerName = Array.isArray(ownerProduct) ? ownerProduct[0]?.name_ar : ownerProduct?.name_ar;
        return {
          ok: false,
          error: ownerName
            ? `This campaign is already linked to "${ownerName}".`
            : "This campaign is already linked to another product.",
        };
      }
      return { ok: false, error: insertErr.message };
    }

    const window = computeBackfillWindow(String(product.created_at));
    const syncResult = await syncProductAdSpend(supabase, {
      productIds: [pid],
      sinceISODate: window.sinceISODate,
      untilISODate: window.untilISODate,
    });

    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/analytics/${pid}`);

    return {
      ok: true,
      campaign: {
        id: String(inserted.id),
        kind: "campaign",
        metaCampaignId: String(inserted.meta_campaign_id),
        metaAdSetId: null,
        label: inserted.label ?? null,
      },
      syncWarning: syncResult.ok ? undefined : (syncResult.error ?? "Ad spend sync failed."),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to link campaign.",
    };
  }
}

export type UnlinkCampaignActionResult = { ok: true } | { ok: false; error: string };

export async function unlinkAdCampaignAction(
  productId: string,
  campaignRowId: string,
): Promise<UnlinkCampaignActionResult> {
  const pid = productId?.trim();
  const rowId = campaignRowId?.trim();
  if (!pid || !rowId) {
    return { ok: false, error: "product_id and campaign id are required." };
  }

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const scope = await requireCountryScope();
    const supabase = createServiceClient();

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("country_id")
      .eq("id", pid)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product) return { ok: false, error: "Product not found." };
    assertInCountryScope(scope, product.country_id as string | null);

    // Historical `product_ad_spend_daily` rows already attributed via this
    // campaign are intentionally NOT purged on unlink: Meta's per-campaign
    // spend was already folded into the product's daily total at sync time,
    // and retroactively subtracting it back out isn't attempted here.
    const { data: campaignRow } = await supabase
      .from("product_ad_campaigns")
      .select("meta_campaign_id, label")
      .eq("id", rowId)
      .eq("product_id", pid)
      .maybeSingle();

    const { error } = await supabase
      .from("product_ad_campaigns")
      .delete()
      .eq("id", rowId)
      .eq("product_id", pid);

    if (error) return { ok: false, error: error.message };

    // Records the event so a later step change in this product's ad-spend
    // series (the next sync only refreshes going forward) is explained by a
    // dated marker instead of looking like unexplained data (A17).
    if (campaignRow) {
      await supabase.from("product_ad_campaign_unlinks").insert({
        product_id: pid,
        meta_campaign_id: String(campaignRow.meta_campaign_id),
        label: campaignRow.label ?? null,
      });
    }

    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/analytics/${pid}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to unlink campaign.",
    };
  }
}

/**
 * Links one Meta ad set to a product. The ad set is looked up on Meta first:
 * an id that doesn't exist or belongs to another ad account is refused, and
 * the campaign id stored with the link comes from Meta's answer, never from
 * the request. Then the same one-time backfill as a campaign link runs, so
 * days already spent (e.g. 2026-11-09/10) are corrected right away.
 */
export async function linkAdSetAction(productId: string, metaAdSetId: string): Promise<LinkCampaignActionResult> {
  const pid = productId?.trim();
  const adSetId = metaAdSetId?.trim();
  if (!pid) return { ok: false, error: "product_id is required." };
  if (!adSetId || !/^[0-9]+$/.test(adSetId)) return { ok: false, error: t.adSetIdInvalid };

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const scope = await requireCountryScope();
    const supabase = createServiceClient();

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, created_at, country_id")
      .eq("id", pid)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product) return { ok: false, error: "Product not found." };
    assertInCountryScope(scope, product.country_id as string | null);

    const info = await fetchAdSetInfo(adSetId);
    if (!info.ok) {
      if (info.reason === "not_found") return { ok: false, error: t.adSetNotFound };
      if (info.reason === "other_account") return { ok: false, error: t.adSetOtherAccount };
      return { ok: false, error: `${t.adSetLookupFailed} (${info.reason})` };
    }

    const { data: wholeOwner, error: wholeErr } = await supabase
      .from("product_ad_campaigns")
      .select("products(name_ar)")
      .eq("meta_campaign_id", info.campaignId)
      .maybeSingle();
    if (wholeErr) return { ok: false, error: wholeErr.message };
    if (wholeOwner) {
      return {
        ok: false,
        error: t.adSetCampaignLinkedWhole.replace("{product}", embeddedProductName(wholeOwner.products) ?? "—"),
      };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("product_ad_sets")
      .insert({
        product_id: pid,
        meta_adset_id: info.adSetId,
        meta_campaign_id: info.campaignId,
        label: info.name,
      })
      .select("id, meta_adset_id, meta_campaign_id, label")
      .single();

    if (insertErr) {
      const exclusion = exclusionTriggerMessage(insertErr.message);
      if (exclusion) return { ok: false, error: exclusion };
      if (insertErr.code === "23505") {
        const { data: owner } = await supabase
          .from("product_ad_sets")
          .select("products(name_ar)")
          .eq("meta_adset_id", info.adSetId)
          .maybeSingle();
        return {
          ok: false,
          error: t.adSetAlreadyLinked.replace("{product}", embeddedProductName(owner?.products) ?? "—"),
        };
      }
      return { ok: false, error: insertErr.message };
    }

    const window = computeBackfillWindow(String(product.created_at));
    const syncResult = await syncProductAdSpend(supabase, {
      productIds: [pid],
      sinceISODate: window.sinceISODate,
      untilISODate: window.untilISODate,
    });

    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/analytics/${pid}`);

    return {
      ok: true,
      campaign: {
        id: String(inserted.id),
        kind: "adset",
        metaCampaignId: String(inserted.meta_campaign_id),
        metaAdSetId: String(inserted.meta_adset_id),
        label: inserted.label ?? null,
      },
      syncWarning: syncResult.ok ? undefined : (syncResult.error ?? "Ad spend sync failed."),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t.adSetLinkFailed };
  }
}

export async function unlinkAdSetAction(productId: string, adSetRowId: string): Promise<UnlinkCampaignActionResult> {
  const pid = productId?.trim();
  const rowId = adSetRowId?.trim();
  if (!pid || !rowId) return { ok: false, error: "product_id and ad set id are required." };

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const scope = await requireCountryScope();
    const supabase = createServiceClient();

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("country_id")
      .eq("id", pid)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product) return { ok: false, error: "Product not found." };
    assertInCountryScope(scope, product.country_id as string | null);

    const { data: row } = await supabase
      .from("product_ad_sets")
      .select("meta_adset_id, meta_campaign_id, label")
      .eq("id", rowId)
      .eq("product_id", pid)
      .maybeSingle();

    const { error } = await supabase.from("product_ad_sets").delete().eq("id", rowId).eq("product_id", pid);
    if (error) return { ok: false, error: error.message };

    // Same dated marker as a campaign unlink (A17); history rows are kept.
    if (row) {
      await supabase.from("product_ad_campaign_unlinks").insert({
        product_id: pid,
        meta_campaign_id: String(row.meta_campaign_id),
        meta_adset_id: String(row.meta_adset_id),
        label: row.label ?? null,
      });
    }

    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/analytics/${pid}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t.adSetUnlinkFailed };
  }
}

export type ActiveAdSetOption = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string | null;
  /** Product this ad set is already linked to, if any. */
  linkedTo: string | null;
  /** Product the whole campaign is linked to, if any (then the ad set can't be linked). */
  campaignLinkedWholeTo: string | null;
};

export type ListAdSetsActionResult =
  | { ok: true; adSets: ActiveAdSetOption[]; truncated: boolean }
  | { ok: false; error: string };

/** The ad account's active ad sets, with what each is already linked to — for the picker. */
export async function listActiveAdSetsAction(): Promise<ListAdSetsActionResult> {
  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const supabase = createServiceClient();
    const [list, adSetLinks, campaignLinks] = await Promise.all([
      listActiveAdSets(),
      supabase.from("product_ad_sets").select("meta_adset_id, products(name_ar)"),
      supabase.from("product_ad_campaigns").select("meta_campaign_id, products(name_ar)"),
    ]);
    if (!list.ok) return { ok: false, error: `${t.adSetListFailed} (${list.reason})` };
    if (adSetLinks.error) return { ok: false, error: adSetLinks.error.message };
    if (campaignLinks.error) return { ok: false, error: campaignLinks.error.message };

    const adSetOwner = new Map(
      (adSetLinks.data ?? []).map((r) => [String(r.meta_adset_id), embeddedProductName(r.products) ?? "—"]),
    );
    const campaignOwner = new Map(
      (campaignLinks.data ?? []).map((r) => [String(r.meta_campaign_id), embeddedProductName(r.products) ?? "—"]),
    );
    return {
      ok: true,
      truncated: list.truncated,
      adSets: list.adSets.map((s) => ({
        ...s,
        linkedTo: adSetOwner.get(s.id) ?? null,
        campaignLinkedWholeTo: campaignOwner.get(s.campaignId) ?? null,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t.adSetListFailed };
  }
}

export type StartDateActionResult =
  | { ok: true; startDate: string | null }
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves (or clears) the per-product profit calculation start date. Passing an
 * empty/null value clears the cutoff so the product reverts to life-to-date
 * metrics. Admin-only via RLS on `products`.
 */
export async function updateCalculationStartDateAction(
  productId: string,
  startDate: string | null,
): Promise<StartDateActionResult> {
  const id = productId?.trim();
  if (!id) {
    return { ok: false, error: "product_id is required." };
  }

  const raw = startDate?.trim() ?? "";
  let value: string | null;
  if (raw === "") {
    value = null;
  } else if (ISO_DATE_RE.test(raw) && !Number.isNaN(new Date(raw).getTime())) {
    value = raw;
  } else {
    return { ok: false, error: "Start date must be a valid date (YYYY-MM-DD)." };
  }

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("products")
      .update({ profit_calculation_start_date: value })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/analytics");
    return { ok: true, startDate: value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save start date.",
    };
  }
}

export type EnsureMonthAdSpendResult =
  | {
      ok: true;
      /** false when every relevant product's window was already fully cached — no Meta call was made. */
      synced: boolean;
      /** Ad spend for OWNED products only — never mix into the affiliate dashboard. */
      ownedAdSpendDaily: { product_id: string; date: string; amount: number }[];
      /** Ad spend for AFFILIATE products only — never mix into the owned/MRU dashboard. */
      affiliateAdSpendDaily: { product_id: string; date: string; amount: number }[];
      /** Products with a linked campaign whose entire window summed to zero spend — see doc comment below. */
      incompleteProductIds: string[];
    }
  | { ok: false; error: string };

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * On-demand historical ad-spend sync for one calendar month, called only when
 * the admin actually selects that month in the period filter (never on normal
 * page load — `ensureFreshAdSpend` already covers the trailing 4 days there).
 *
 * Never re-calls Meta for a month whose window is already fully cached: every
 * product with a linked campaign is checked against `product_ad_spend_daily`
 * first, and only products missing at least one day in the window are synced
 * (one batched Marketing API call for all of them, via the existing
 * `syncProductAdSpend`, same as every other sync path).
 */
export async function ensureMonthAdSpendAction(month: string): Promise<EnsureMonthAdSpendResult> {
  if (!MONTH_RE.test(month) || Number.isNaN(new Date(`${month}-01T00:00:00Z`).getTime())) {
    return { ok: false, error: "Invalid month." };
  }

  try {
    await assertPermission(PERMISSIONS.view_analytics);
    const { selectedCountryId } = await getCountryScope();
    const supabase = createServiceClient();

    // fulfillment_type is required so the returned ad spend can be split by
    // owned/affiliate below — mixing the two here is what used to leak a
    // foreign-currency product's ad spend into the MRU dashboard and vice
    // versa (a phantom "—" product materializing in the wrong section).
    let productsQuery = supabase.from("products").select("id, fulfillment_type");
    if (selectedCountryId) productsQuery = productsQuery.eq("country_id", selectedCountryId);
    const { data: productRows, error: productsErr } = await productsQuery;
    if (productsErr) return { ok: false, error: productsErr.message };

    const productIds = (productRows ?? []).map((p) => String(p.id));
    if (productIds.length === 0) {
      return { ok: true, synced: false, ownedAdSpendDaily: [], affiliateAdSpendDaily: [], incompleteProductIds: [] };
    }
    const ownedProductIds = new Set(
      (productRows ?? []).filter((p) => p.fulfillment_type !== "affiliate").map((p) => String(p.id)),
    );

    // A product counts as linked with a campaign OR an ad set.
    const linksRes = await loadAdLinks(supabase, productIds);
    if (!linksRes.ok) return { ok: false, error: linksRes.error };

    const productsWithCampaigns = linkedProductIds(linksRes.links);
    if (productsWithCampaigns.length === 0) {
      return { ok: true, synced: false, ownedAdSpendDaily: [], affiliateAdSpendDaily: [], incompleteProductIds: [] };
    }

    const { startKey, endKey: monthEndKey } = monthRange(month);
    const todayKey = dayKey(new Date());
    const untilKey = monthEndKey < todayKey ? monthEndKey : todayKey;
    const daysInWindow = daysBetween(startKey, untilKey) + 1;

    const existingRes = await fetchAllRows<{ product_id: string; date: string; amount: number }>(
      () =>
        supabase
          .from("product_ad_spend_daily")
          .select("product_id, date, amount")
          .in("product_id", productsWithCampaigns)
          .gte("date", startKey)
          .lte("date", untilKey) as never,
      ["date", "product_id"],
    );
    if (existingRes.error) return { ok: false, error: existingRes.error };

    const datesByProduct = new Map<string, Set<string>>();
    for (const row of existingRes.rows) {
      const pid = String(row.product_id);
      const set = datesByProduct.get(pid) ?? new Set<string>();
      set.add(String(row.date));
      datesByProduct.set(pid, set);
    }

    const staleProductIds = productsWithCampaigns.filter(
      (pid) => (datesByProduct.get(pid)?.size ?? 0) < daysInWindow,
    );

    let synced = false;
    if (staleProductIds.length > 0) {
      const syncResult = await syncProductAdSpend(supabase, {
        productIds: staleProductIds,
        sinceISODate: startKey,
        untilISODate: untilKey,
      });
      if (!syncResult.ok) {
        return { ok: false, error: syncResult.error ?? "Ad spend sync failed." };
      }
      synced = true;
    }

    const finalRes = synced
      ? await fetchAllRows<{ product_id: string; date: string; amount: number }>(
          () =>
            supabase
              .from("product_ad_spend_daily")
              .select("product_id, date, amount")
              .in("product_id", productsWithCampaigns)
              .gte("date", startKey)
              .lte("date", untilKey) as never,
          ["date", "product_id"],
        )
      : existingRes;
    if (finalRes.error) return { ok: false, error: finalRes.error };

    const adSpendDaily = finalRes.rows.map((r) => ({
      product_id: String(r.product_id),
      date: String(r.date),
      amount: Number(r.amount) || 0,
    }));

    // Heuristic, deliberately conservative: a linked campaign whose entire
    // window summed to exactly zero spend might genuinely have spent nothing,
    // or might predate linking / be outside what Meta has data for — we can't
    // tell the two apart from this table alone, so we flag it rather than
    // silently showing a confident zero.
    const sumByProduct = new Map<string, number>();
    for (const row of adSpendDaily) {
      sumByProduct.set(row.product_id, (sumByProduct.get(row.product_id) ?? 0) + row.amount);
    }
    const incompleteProductIds = productsWithCampaigns.filter((pid) => (sumByProduct.get(pid) ?? 0) === 0);

    const ownedAdSpendDaily = adSpendDaily.filter((r) => ownedProductIds.has(r.product_id));
    const affiliateAdSpendDaily = adSpendDaily.filter((r) => !ownedProductIds.has(r.product_id));

    return { ok: true, synced, ownedAdSpendDaily, affiliateAdSpendDaily, incompleteProductIds };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to sync ad spend for that month.",
    };
  }
}
