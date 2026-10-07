import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { assertValidOrderTransition } from "@/lib/order-state-machine";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

/** Confirmation payload describing the Meta CAPI side effect for an order status change. */
export type MetaSideEffect =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string };

/** What happened to the item when a shipped order comes back (internal_return). */
export type ReturnDisposition = "resellable" | "damaged";

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
  | {
      ok: false;
      code: "not_found" | "invalid_transition" | "conflict" | "db_error";
      error: string;
    };

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
 * Validates the transition against the order state machine, then applies it
 * through the `change_order_status` database function (migration 072): a
 * compare-and-set on the previous status that also writes
 * `order_status_history` and — through `trg_orders_sync_stock` — the stock
 * movement, all in one transaction. Two concurrent changes of the same order
 * can't both apply. Only after that succeeds does it trigger the Meta CAPI
 * workflow (Purchase on `confirmed`, CancelledLead on `cancelled`), exactly as
 * before. Used by the `/api/orders/[id]` PATCH route, the bulk action, the
 * WhatsApp sale and the Admin Command Assistant.
 *
 * Callers must enforce authentication before invoking.
 */
export async function updateOrderStatusWithEffects(
  supabase: SupabaseClient,
  orderId: string,
  nextStatus: OrderStatus,
  options: {
    requestHeaders?: Headers;
    changedBy?: string | null;
    /** Only used for shipped → internal_return; defaults to resellable. */
    returnDisposition?: ReturnDisposition | null;
  } = {},
): Promise<OrderStatusChangeResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status, deleted_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, code: "db_error", error: fetchErr.message };
  }
  if (!existing || existing.deleted_at != null) {
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

  const { data: newStatus, error: changeErr } = await supabase.rpc("change_order_status", {
    p_order_id: orderId,
    p_from: fromStatus,
    p_to: nextStatus,
    p_changed_by: options.changedBy?.trim() || null,
    p_return_disposition: nextStatus === "internal_return" ? options.returnDisposition ?? null : null,
  });

  if (changeErr) {
    const message = changeErr.message ?? "";
    if (message.includes("status_conflict")) {
      return {
        ok: false,
        code: "conflict",
        error: "This order's status was changed by someone else — reload and try again.",
      };
    }
    if (message.includes("order_not_found")) {
      return { ok: false, code: "not_found", error: "Order not found" };
    }
    return { ok: false, code: "db_error", error: message };
  }

  const toStatus = ((newStatus as string | null) ?? nextStatus) as OrderStatus;
  const result: OrderStatusChangeResult = {
    ok: true,
    orderId,
    fromStatus,
    toStatus,
    unchanged: false,
  };

  try {
    if (toStatus === "confirmed") {
      const purchase = await dispatchMetaEvent(supabase, orderId, "purchase", {
        requestHeaders: options.requestHeaders,
      });
      result.metaPurchase = mapDispatch(purchase);
    } else if (toStatus === "cancelled") {
      const cancel = await dispatchMetaEvent(supabase, orderId, "cancel", {
        requestHeaders: options.requestHeaders,
      });
      result.metaCancel = mapDispatch(cancel);
    }
    // `internal_return` (and every other status) intentionally dispatches no
    // Meta CAPI event. Internal returns are a bookkeeping-only adjustment, so a
    // previously sent Purchase is left untouched and NO CancelledLead/refund is
    // emitted — Meta optimization data stays clean.
  } catch (error) {
    console.error("[updateOrderStatusWithEffects] Meta processing failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (toStatus === "confirmed") {
      result.metaPurchase = { state: "failed", reason: "capi_exception" };
    } else if (toStatus === "cancelled") {
      result.metaCancel = { state: "failed", reason: "capi_exception" };
    }
  }

  return result;
}
