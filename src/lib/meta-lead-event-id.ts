/** Per-order Lead `event_id` — unique per order, never shared with InitiateCheckout. */
export function buildMetaLeadEventId(orderId: string): string {
  return `lead_${orderId.trim()}`;
}

/**
 * Canonical Lead dedup key for browser Pixel (`eventID`) and CAPI (`event_id`).
 *
 * Always scoped to the order id so Lead never reuses the InitiateCheckout funnel
 * session id (`orders.meta_event_id`). Browser + CAPI Lead copies must still share
 * this same value for Meta deduplication.
 *
 * `metaEventId` is accepted for call-site compatibility but ignored — funnel session
 * ids must not become Lead event ids.
 */
export function resolveLeadEventId(input: {
  orderId: string;
  metaEventId?: string | null;
}): string {
  void input.metaEventId;
  return buildMetaLeadEventId(input.orderId);
}
