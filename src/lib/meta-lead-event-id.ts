/** Per-order fallback when `orders.meta_event_id` is missing (legacy rows). */
export function buildMetaLeadEventId(orderId: string): string {
  return `lead_${orderId.trim()}`;
}

/**
 * Canonical Lead dedup key for browser Pixel (`eventID`) and CAPI (`event_id`).
 * Uses the funnel session id stored on the order (same id as InitiateCheckout).
 */
export function resolveLeadEventId(input: {
  orderId: string;
  metaEventId?: string | null;
}): string {
  const funnel = input.metaEventId?.trim();
  if (funnel) return funnel;
  return buildMetaLeadEventId(input.orderId);
}
