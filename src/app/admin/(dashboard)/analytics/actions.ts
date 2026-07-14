"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import { computeBackfillWindow, syncProductAdSpend } from "@/lib/analytics/ad-spend-sync";

export type LinkCampaignActionResult =
  | {
      ok: true;
      campaign: { id: string; metaCampaignId: string; label: string | null };
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
    const supabase = createServiceClient();

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, created_at")
      .eq("id", pid)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product) return { ok: false, error: "Product not found." };

    const { data: inserted, error: insertErr } = await supabase
      .from("product_ad_campaigns")
      .insert({ product_id: pid, meta_campaign_id: campaignId, label: label?.trim() || null })
      .select("id, meta_campaign_id, label")
      .single();

    if (insertErr) {
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
        metaCampaignId: String(inserted.meta_campaign_id),
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
    const supabase = createServiceClient();

    // Historical `product_ad_spend_daily` rows already attributed via this
    // campaign are intentionally NOT purged on unlink: Meta's per-campaign
    // spend was already folded into the product's daily total at sync time,
    // and retroactively subtracting it back out isn't attempted here.
    const { error } = await supabase
      .from("product_ad_campaigns")
      .delete()
      .eq("id", rowId)
      .eq("product_id", pid);

    if (error) return { ok: false, error: error.message };

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
