"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser, assertPermission, AuthError } from "@/lib/auth/admin";
import { canEditOrderDetails, PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";

/** Soft-delete: hides the order from admin UI while preserving audit data. */
export async function deleteOrderAction(id: string) {
  await deleteOrdersAction([id]);
}

/** Soft-delete multiple orders in one round-trip. */
export async function deleteOrdersAction(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await assertPermission(PERMISSIONS.cancel_orders);

  // Service role bypasses RLS after the permission gate above — same pattern as
  // PATCH /api/orders/[id] status updates. The user-scoped client cannot soft-
  // delete because orders_update_admin WITH CHECK rejects rows once deleted_at
  // is set (037 regression until migration 040 is applied).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", uniqueIds)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== uniqueIds.length) {
    throw new Error("Some orders could not be deleted");
  }
  revalidatePath("/admin/orders");
}

export type DeliveryCostActionResult =
  | { ok: true; amount: number | null }
  | { ok: false; error: string };

/** Per-order delivery cost, editable from the order detail view (feeds profit analytics). */
export async function updateOrderDeliveryCostAction(
  orderId: string,
  amount: number | null,
): Promise<DeliveryCostActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { ok: false, error: "Delivery cost must be a number greater than or equal to zero." };
  }

  const rounded = amount === null ? null : Math.round(amount * 100) / 100;

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("orders")
      .update({ delivery_cost: rounded })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, amount: rounded };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save delivery cost.",
    };
  }
}
