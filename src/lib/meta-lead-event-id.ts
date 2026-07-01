/** Deterministic Lead `event_id` shared by browser Pixel and CAPI (per order). */
export function buildMetaLeadEventId(orderId: string): string {
  return `lead_${orderId.trim()}`;
}
