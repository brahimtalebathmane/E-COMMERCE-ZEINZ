"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/auth/admin";

export type AdSpendActionResult = { ok: true; amount: number } | { ok: false; error: string };

/**
 * Upserts the manual cumulative ad spend (MRU) for a single product. Used by the
 * profit analytics dashboard; admin-only via RLS on `product_ad_spend`.
 */
export async function updateAdSpendAction(
  productId: string,
  amount: number,
): Promise<AdSpendActionResult> {
  const id = productId?.trim();
  if (!id) {
    return { ok: false, error: "product_id is required." };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Ad spend must be a number greater than or equal to zero." };
  }

  const rounded = Math.round(amount * 100) / 100;

  try {
    const { supabase } = await assertAdminUser();
    const { error } = await supabase
      .from("product_ad_spend")
      .upsert(
        { product_id: id, amount: rounded, updated_at: new Date().toISOString() },
        { onConflict: "product_id" },
      );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/analytics");
    return { ok: true, amount: rounded };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save ad spend.",
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
    const { supabase } = await assertAdminUser();
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
