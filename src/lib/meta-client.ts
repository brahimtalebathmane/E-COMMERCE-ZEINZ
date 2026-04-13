export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";
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

/**
 * Ensures a stable funnel event_id until 60m inactivity or explicit clear after successful lead.
 * No cross-tab pairing — same storage is shared across tabs (predictable, simple).
 */
export function ensureMetaFunnelSession(): string {
  const now = Date.now();
  try {
    const existingId = localStorage.getItem(META_EVENT_ID_STORAGE_KEY)?.trim();
    const lastRaw = localStorage.getItem(META_LAST_ACTIVITY_MS_KEY);
    const lastMs = lastRaw ? Number(lastRaw) : 0;
    const lastOk = Number.isFinite(lastMs) && lastMs > 0;
    const expired = !lastOk || now - lastMs > SESSION_TTL_MS;

    if (existingId && !expired) {
      localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
      return existingId;
    }

    const next = createClientMetaEventId();
    localStorage.setItem(META_EVENT_ID_STORAGE_KEY, next);
    localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
    return next;
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
    localStorage.removeItem(META_LAST_ACTIVITY_MS_KEY);
    localStorage.removeItem("meta_event_paired_tab_session_id");
    sessionStorage.removeItem("meta_funnel_tab_session_id");
  } catch {
    // ignore
  }
}
