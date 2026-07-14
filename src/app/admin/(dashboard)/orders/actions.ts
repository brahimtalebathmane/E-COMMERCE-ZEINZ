"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertAdminUser, assertPermission, AuthError } from "@/lib/auth/admin";
import { canEditOrderDetails, PERMISSIONS, permissionForOrderStatus } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import { updateOrderStatusWithEffects } from "@/lib/orders/update-status";
import type { OrderStatus } from "@/types";

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

export type NoteActionResult = { ok: true; note: string | null } | { ok: false; error: string };

/** Free-text admin note, editable directly from the order row/card and the detail modal. */
export async function updateOrderNoteAction(
  orderId: string,
  note: string | null,
): Promise<NoteActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }

  const trimmed = note?.trim() ?? "";
  const value = trimmed === "" ? null : trimmed;

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("orders").update({ note: value }).eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    return { ok: true, note: value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save note.",
    };
  }
}

export type BulkStatusActionResult =
  | { ok: true; succeededIds: string[]; failedIds: string[] }
  | { ok: false; error: string };

/**
 * Bulk status change for selected orders. Loops `updateOrderStatusWithEffects`
 * per order (not a raw bulk SQL UPDATE) so each order still gets state-machine
 * validation, `order_status_history` logging, and the Meta Purchase/
 * CancelledLead CAPI dispatch it would get from a single-order change —
 * skipping that per-order logic would silently break Meta tracking parity.
 * Returns per-order results (not just counts) so the client can patch exactly
 * the orders that actually changed rather than guessing.
 */
export async function updateOrdersStatusBulkAction(
  orderIds: string[],
  nextStatus: OrderStatus,
): Promise<BulkStatusActionResult> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "No orders selected." };
  }

  try {
    const requiredPermission = permissionForOrderStatus(nextStatus);
    if (!requiredPermission) {
      return { ok: false, error: "Invalid status." };
    }
    const session = await assertPermission(requiredPermission);
    const requestHeaders = await headers();
    const supabase = createServiceClient();

    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    for (const orderId of uniqueIds) {
      const result = await updateOrderStatusWithEffects(supabase, orderId, nextStatus, {
        requestHeaders,
        changedBy: session.access.userId,
      });
      if (result.ok) succeededIds.push(orderId);
      else failedIds.push(orderId);
    }

    revalidatePath("/admin/orders");
    return { ok: true, succeededIds, failedIds };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update status.",
    };
  }
}
