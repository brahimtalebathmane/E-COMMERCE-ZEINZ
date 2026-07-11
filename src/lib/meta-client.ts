export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";
export const META_EVENT_PRODUCT_ID_KEY = "meta_event_product_id_session";
export const META_LAST_ACTIVITY_MS_KEY = "meta_event_last_activity_ms";

const SESSION_TTL_MS = 60 * 60 * 1000;
const ACTIVITY_TOUCH_THROTTLE_MS = 25_000;

let lastThrottledTouchWrite = 0;

export function createClientMetaEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${Date.now()}_${crypto.randomUUID()}`;
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeFunnelProductId(productId?: string | null): string | null {
  const id = productId?.trim();
  return id || null;
}

function startNewFunnelSession(now: number, productId?: string | null): string {
  const next = createClientMetaEventId();
  localStorage.setItem(META_EVENT_ID_STORAGE_KEY, next);
  localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
  const normalizedProductId = normalizeFunnelProductId(productId);
  if (normalizedProductId) {
    localStorage.setItem(META_EVENT_PRODUCT_ID_KEY, normalizedProductId);
  } else {
    localStorage.removeItem(META_EVENT_PRODUCT_ID_KEY);
  }
  return next;
}

/**
 * Ensures a stable funnel event_id until 60m inactivity, product change, or explicit clear.
 * Shared by InitiateCheckout and Lead so Meta can stitch the full funnel journey.
 * When `productId` changes within the TTL, a fresh event_id is issued so InitiateCheckout
 * dedupe does not block the new product's checkout events.
 */
export function ensureMetaFunnelSession(productId?: string | null): string {
  const now = Date.now();
  const normalizedProductId = normalizeFunnelProductId(productId);
  try {
    const existingId = localStorage.getItem(META_EVENT_ID_STORAGE_KEY)?.trim();
    const lastRaw = localStorage.getItem(META_LAST_ACTIVITY_MS_KEY);
    const lastMs = lastRaw ? Number(lastRaw) : 0;
    const lastOk = Number.isFinite(lastMs) && lastMs > 0;
    const expired = !lastOk || now - lastMs > SESSION_TTL_MS;

    if (existingId && !expired) {
      const storedProductId = normalizeFunnelProductId(
        localStorage.getItem(META_EVENT_PRODUCT_ID_KEY),
      );
      if (
        normalizedProductId &&
        storedProductId &&
        storedProductId !== normalizedProductId
      ) {
        return startNewFunnelSession(now, normalizedProductId);
      }
      if (normalizedProductId && !storedProductId) {
        localStorage.setItem(META_EVENT_PRODUCT_ID_KEY, normalizedProductId);
      }
      localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
      return existingId;
    }

    return startNewFunnelSession(now, normalizedProductId);
  } catch {
    return createClientMetaEventId();
  }
}

/** Updates last-activity only (extends TTL). Safe when no session exists yet. */
export function touchMetaFunnelActivity(): void {
  if (typeof window === "undefined") return;
  try {
    if (!localStorage.getItem(META_EVENT_ID_STORAGE_KEY)?.trim()) return;
    localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Throttled activity bump for high-frequency signals (scroll, visibility).
 * Does not change event_id.
 */
export function touchMetaFunnelActivityThrottled(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastThrottledTouchWrite < ACTIVITY_TOUCH_THROTTLE_MS) return;
  lastThrottledTouchWrite = now;
  touchMetaFunnelActivity();
}

/** Clears funnel session state so the next visit can start a new attribution session. */
export function clearMetaSessionEventId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_EVENT_ID_STORAGE_KEY);
    localStorage.removeItem(META_EVENT_PRODUCT_ID_KEY);
    localStorage.removeItem(META_LAST_ACTIVITY_MS_KEY);
    localStorage.removeItem("meta_event_paired_tab_session_id");
    sessionStorage.removeItem("meta_funnel_tab_session_id");
  } catch {
    // ignore
  }
}
