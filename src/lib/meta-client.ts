export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";
export const META_EVENT_PRODUCT_ID_KEY = "meta_event_product_id_session";
export const META_LAST_ACTIVITY_MS_KEY = "meta_event_last_activity_ms";

/** Product-scoped funnel session keys (sessionStorage — isolated per browser tab). */
export const META_FUNNEL_STORAGE_VERSION = "v2";

const SESSION_TTL_MS = 60 * 60 * 1000;
const ACTIVITY_TOUCH_THROTTLE_MS = 25_000;

let lastThrottledTouchWrite = 0;
/** Last product whose funnel session was touched in this tab (module state is tab-local). */
let activeFunnelProductId: string | null = null;

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

export function metaFunnelEventIdStorageKey(productId: string): string {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:event_id`;
}

export function metaFunnelActivityStorageKey(productId: string): string {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:last_activity_ms`;
}

function getFunnelStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage;
  } catch {
    return null;
  }
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

function startNewFunnelSession(
  storage: Storage,
  now: number,
  productId: string,
): string {
  const next = createClientMetaEventId();
  storage.setItem(metaFunnelEventIdStorageKey(productId), next);
  storage.setItem(metaFunnelActivityStorageKey(productId), String(now));
  activeFunnelProductId = productId;
  return next;
}

/**
 * Ensures a stable InitiateCheckout funnel event_id until 60m inactivity or explicit clear.
 * Storage: sessionStorage keyed by productId (tab-isolated; no cross-tab races).
 * Used only for InitiateCheckout (browser + CAPI pair). Lead uses `lead_{orderId}`.
 */
export function ensureMetaFunnelSession(productId?: string | null): string {
  const normalizedProductId = normalizeFunnelProductId(productId);
  if (!normalizedProductId) {
    console.error(
      "[meta] ensureMetaFunnelSession requires productId — caller must skip Meta events",
    );
    return "";
  }

  clearLegacyFunnelLocalStorage();

  const now = Date.now();
  const storage = getFunnelStorage();
  if (!storage) {
    activeFunnelProductId = normalizedProductId;
    return createClientMetaEventId();
  }

  try {
    const eventKey = metaFunnelEventIdStorageKey(normalizedProductId);
    const activityKey = metaFunnelActivityStorageKey(normalizedProductId);
    const existingId = storage.getItem(eventKey)?.trim();
    const lastRaw = storage.getItem(activityKey);
    const lastMs = lastRaw ? Number(lastRaw) : 0;
    const lastOk = Number.isFinite(lastMs) && lastMs > 0;
    const expired = !lastOk || now - lastMs > SESSION_TTL_MS;

    activeFunnelProductId = normalizedProductId;

    if (existingId && !expired) {
      storage.setItem(activityKey, String(now));
      return existingId;
    }

    return startNewFunnelSession(storage, now, normalizedProductId);
  } catch {
    activeFunnelProductId = normalizedProductId;
    return createClientMetaEventId();
  }
}

/** Updates last-activity only (extends TTL). Safe when no session exists yet. */
export function touchMetaFunnelActivity(productId?: string | null): void {
  if (typeof window === "undefined") return;
  const id = normalizeFunnelProductId(productId) ?? activeFunnelProductId;
  if (!id) return;

  const storage = getFunnelStorage();
  if (!storage) return;

  try {
    const eventKey = metaFunnelEventIdStorageKey(id);
    if (!storage.getItem(eventKey)?.trim()) return;
    storage.setItem(metaFunnelActivityStorageKey(id), String(Date.now()));
    activeFunnelProductId = id;
  } catch {
    // ignore
  }
}

/**
 * Throttled activity bump for high-frequency signals (scroll, visibility).
 * Does not change event_id.
 */
export function touchMetaFunnelActivityThrottled(productId?: string | null): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastThrottledTouchWrite < ACTIVITY_TOUCH_THROTTLE_MS) return;
  lastThrottledTouchWrite = now;
  touchMetaFunnelActivity(productId);
}

/** Clears funnel session state so the next visit can start a new attribution session. */
export function clearMetaSessionEventId(productId?: string | null): void {
  if (typeof window === "undefined") return;

  clearLegacyFunnelLocalStorage();

  const id = normalizeFunnelProductId(productId) ?? activeFunnelProductId;
  const storage = getFunnelStorage();
  if (storage && id) {
    try {
      storage.removeItem(metaFunnelEventIdStorageKey(id));
      storage.removeItem(metaFunnelActivityStorageKey(id));
    } catch {
      // ignore
    }
  }

  if (id && activeFunnelProductId === id) {
    activeFunnelProductId = null;
  }

  try {
    sessionStorage.removeItem("meta_funnel_tab_session_id");
  } catch {
    // ignore
  }
}
