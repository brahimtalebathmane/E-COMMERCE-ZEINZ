/** Browser Lead payload queued until order-success (avoids losing fbq on navigation). */

export const META_PENDING_LEAD_STORAGE_KEY = "meta_pending_lead_v1";

export type MetaPendingLeadPayload = {
  value: number;
  currency: string;
  eventId: string;
  orderId: string;
  productId: string;
  productName: string;
  pixelId?: string | null;
  phone?: string;
  customerName?: string;
  quantity?: number;
  capiConfigured?: boolean;
  capiLeadSent?: boolean;
  capiState?: string;
  capiReason?: string;
};

function isValidPayload(raw: unknown): raw is MetaPendingLeadPayload {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.value === "number" &&
    Number.isFinite(p.value) &&
    typeof p.currency === "string" &&
    p.currency.trim().length > 0 &&
    typeof p.eventId === "string" &&
    p.eventId.trim().length > 0 &&
    typeof p.orderId === "string" &&
    p.orderId.trim().length > 0 &&
    typeof p.productId === "string" &&
    p.productId.trim().length > 0 &&
    typeof p.productName === "string" &&
    p.productName.trim().length > 0
  );
}

/** Persist Lead params for firing on the order-success page after navigation. */
export function queueMetaPendingLead(payload: MetaPendingLeadPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(META_PENDING_LEAD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Read and remove the pending Lead for this order id.
 * Returns null when missing, malformed, or order id mismatch.
 */
export function consumeMetaPendingLead(orderId: string): MetaPendingLeadPayload | null {
  if (typeof window === "undefined") return null;
  const id = orderId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(META_PENDING_LEAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidPayload(parsed) || parsed.orderId.trim() !== id) return null;
    sessionStorage.removeItem(META_PENDING_LEAD_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}
