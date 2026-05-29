import type { OrderStatus } from "@/types";

/**
 * Allowed order status transitions.
 * Maps product spec to existing enum (no delivered/returned columns yet).
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled", "requires_human_intervention"],
  confirmed: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
  requires_human_intervention: ["confirmed", "cancelled"],
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
