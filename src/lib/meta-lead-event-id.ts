/** Deterministic Lead `event_id` for CAPI + optional browser fallback (per order). */
export function buildMetaLeadEventId(orderId: string): string {
  return `lead_${orderId.trim()}`;
}
