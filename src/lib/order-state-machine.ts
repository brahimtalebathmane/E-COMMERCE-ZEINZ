import type { OrderStatus } from "@/types";

/**
 * Allowed order status transitions.
 *
 * `internal_return` is a bookkeeping-only terminal state reachable from realized
 * sales (`confirmed` / `shipped`). It removes the order from profit metrics
 * WITHOUT firing any Meta CAPI event (see `update-status.ts`), so Meta pixel
 * optimization models are never polluted with cancellation/refund signals.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled", "requires_human_intervention"],
  confirmed: ["shipped", "cancelled", "internal_return"],
  shipped: ["internal_return"],
  cancelled: [],
  requires_human_intervention: ["confirmed", "cancelled"],
  internal_return: [],
};

export function assertValidOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): { ok: true } | { ok: false; error: string } {
  if (from === to) {
    return { ok: true };
  }
  const allowed = ORDER_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `Invalid status transition: ${from} -> ${to}`,
    };
  }
  return { ok: true };
}
