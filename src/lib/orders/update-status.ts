import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { assertValidOrderTransition } from "@/lib/order-state-machine";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

/** Confirmation payload describing the Meta CAPI side effect for an order status change. */
export type MetaSideEffect =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string };

export type OrderStatusChangeResult =
  | {
      ok: true;
      orderId: string;
      fromStatus: OrderStatus;
      toStatus: OrderStatus;
      unchanged: boolean;
      metaPurchase?: MetaSideEffect;
      metaCancel?: MetaSideEffect;
    }
  | { ok: false; code: "not_found" | "invalid_transition" | "db_error"; error: string };

function mapDispatch(
  result: Awaited<ReturnType<typeof dispatchMetaEvent>>,
): MetaSideEffect {
  if (result.sent) return { state: "sent" };
  if ("skipped" in result && result.skipped) {
    return { state: "skipped", reason: result.reason };
  }
  return { state: "failed", reason: "reason" in result ? result.reason : "capi_failed" };
}

/**
 * Single source of truth for admin-initiated order status changes.
 *
 * Validates the transition against the order state machine, updates the row,
 * and triggers the corresponding Meta CAPI background workflow (Purchase on
 * `confirmed`, CancelledLead on `cancelled`). Used by both the `/api/orders/[id]`
 * PATCH route and the Admin Command Assistant so behaviour stays identical.
 *
 * Callers must enforce authentication before invoking.
 */
export async function updateOrderStatusWithEffects(
  supabase: SupabaseClient,
  orderId: string,
  nextStatus: OrderStatus,
  options: { requestHeaders?: Headers } = {},
): Promise<OrderStatusChangeResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, code: "db_error", error: fetchErr.message };
  }
  if (!existing) {
    return { ok: false, code: "not_found", error: "Order not found" };
  }

  const fromStatus = existing.status as OrderStatus;

  if (fromStatus === nextStatus) {
    return {
      ok: true,
      orderId,
      fromStatus,
      toStatus: nextStatus,
      unchanged: true,
    };
  }

  const transition = assertValidOrderTransition(fromStatus, nextStatus);
  if (!transition.ok) {
    return { ok: false, code: "invalid_transition", error: transition.error };
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .select("id, status")
    .maybeSingle();

  if (updateError) {
    return { ok: false, code: "db_error", error: updateError.message };
  }
  if (!updated) {
    return { ok: false, code: "not_found", error: "Order not found" };
  }

  const result: OrderStatusChangeResult = {
    ok: true,
    orderId,
    fromStatus,
    toStatus: updated.status as OrderStatus,
    unchanged: false,
  };

  try {
    if (updated.status === "confirmed") {
      const purchase = await dispatchMetaEvent(supabase, orderId, "purchase", {
        requestHeaders: options.requestHeaders,
      });
      result.metaPurchase = mapDispatch(purchase);
    } else if (updated.status === "cancelled") {
      const cancel = await dispatchMetaEvent(supabase, orderId, "cancel", {
        requestHeaders: options.requestHeaders,
      });
      result.metaCancel = mapDispatch(cancel);
    }
  } catch (error) {
    console.error("[updateOrderStatusWithEffects] Meta processing failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (updated.status === "confirmed") {
      result.metaPurchase = { state: "failed", reason: "capi_exception" };
    } else if (updated.status === "cancelled") {
      result.metaCancel = { state: "failed", reason: "capi_exception" };
    }
  }

  return result;
}
