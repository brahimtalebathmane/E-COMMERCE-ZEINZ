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
