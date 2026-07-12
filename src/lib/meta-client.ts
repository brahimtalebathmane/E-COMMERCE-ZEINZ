export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";
export const META_EVENT_PRODUCT_ID_KEY = "meta_event_product_id_session";
export const META_LAST_ACTIVITY_MS_KEY = "meta_event_last_activity_ms";

/** Legacy product-scoped funnel session keys (pre-pageload-scoped ids) — cleanup only. */
export const META_FUNNEL_STORAGE_VERSION = "v2";

export function createClientMetaEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${Date.now()}_${crypto.randomUUID()}`;
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** InitiateCheckout funnel id — `ic_` prefix keeps event_ids unique per event type. */
export function createMetaFunnelEventId(): string {
  return `ic_${createClientMetaEventId()}`;
}

function normalizeFunnelProductId(productId?: string | null): string | null {
  const id = productId?.trim();
  return id || null;
}

export function metaFunnelEventIdStorageKey(productId: string): string {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:event_id`;
}

export function metaFunnelActivityStorageKey(productId: string): string {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:last_activity_ms`;
}

/** Remove pre-v2 origin-wide localStorage funnel keys (cross-tab leak vector). */
export function clearLegacyFunnelLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_EVENT_ID_STORAGE_KEY);
    localStorage.removeItem(META_EVENT_PRODUCT_ID_KEY);
    localStorage.removeItem(META_LAST_ACTIVITY_MS_KEY);
    localStorage.removeItem("meta_event_paired_tab_session_id");
  } catch {
    // ignore
  }
}

/**
 * Per-pageload InitiateCheckout funnel ids (module state resets on every full page load).
 * Each fresh landing visit gets a new `ic_…` id so its browser + CAPI InitiateCheckout
 * pair actually fires; repeat CTA taps within the same pageload reuse the id, and the
 * pixel session lock plus the server `funnel_meta_dispatches` ledger keep each id
 * exactly-once on both channels. Lead is untouched (`lead_{orderId}`).
 */
const funnelEventIdByProduct = new Map<string, string>();

export function ensureMetaFunnelSession(productId?: string | null): string {
  const normalizedProductId = normalizeFunnelProductId(productId);
  if (!normalizedProductId) {
    console.error(
      "[meta] ensureMetaFunnelSession requires productId — caller must skip Meta events",
    );
    return "";
  }

  clearLegacyFunnelLocalStorage();

  const existing = funnelEventIdByProduct.get(normalizedProductId);
  if (existing) return existing;

  const next = createMetaFunnelEventId();
  funnelEventIdByProduct.set(normalizedProductId, next);
  return next;
}

/** No-op — funnel ids are per pageload now; kept so existing activity call sites compile. */
export function touchMetaFunnelActivity(productId?: string | null): void {
  void productId;
}

/** No-op — funnel ids are per pageload now; kept so existing activity call sites compile. */
export function touchMetaFunnelActivityThrottled(productId?: string | null): void {
  void productId;
}

/** Clears funnel state (and legacy storage keys) so the next visit starts a new session. */
export function clearMetaSessionEventId(productId?: string | null): void {
  if (typeof window === "undefined") return;

  clearLegacyFunnelLocalStorage();

  const id = normalizeFunnelProductId(productId);
  if (id) {
    funnelEventIdByProduct.delete(id);
    try {
      sessionStorage.removeItem(metaFunnelEventIdStorageKey(id));
      sessionStorage.removeItem(metaFunnelActivityStorageKey(id));
    } catch {
      // ignore
    }
  }

  try {
    sessionStorage.removeItem("meta_funnel_tab_session_id");
  } catch {
    // ignore
  }
}
