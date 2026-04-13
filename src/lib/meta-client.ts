export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";
export const META_LAST_ACTIVITY_MS_KEY = "meta_event_last_activity_ms";
/** Binds funnel session in localStorage to a tab session id in sessionStorage (new tab = new funnel). */
export const META_PAIRED_TAB_SESSION_KEY = "meta_event_paired_tab_session_id";
const META_TAB_SESSION_STORAGE_KEY = "meta_funnel_tab_session_id";

const SESSION_TTL_MS = 60 * 60 * 1000;

export function createClientMetaEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${Date.now()}_${crypto.randomUUID()}`;
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getOrCreateTabSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(META_TAB_SESSION_STORAGE_KEY)?.trim();
    if (!id) {
      id = createClientMetaEventId();
      sessionStorage.setItem(META_TAB_SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `tab_${Date.now()}`;
  }
}

/**
 * Ensures a stable funnel event_id for PageView → InitiateCheckout → Lead until TTL, new tab, or explicit clear.
 * Call on landing load and before submit; bumps activity timestamp when session stays valid.
 */
export function ensureMetaFunnelSession(): string {
  const tabSessionId = getOrCreateTabSessionId();
  const now = Date.now();
  try {
    const existingId = localStorage.getItem(META_EVENT_ID_STORAGE_KEY)?.trim();
    const paired = localStorage.getItem(META_PAIRED_TAB_SESSION_KEY)?.trim();
    const lastRaw = localStorage.getItem(META_LAST_ACTIVITY_MS_KEY);
    const lastMs = lastRaw ? Number(lastRaw) : 0;
    const lastOk = Number.isFinite(lastMs) && lastMs > 0;
    const expired = !lastOk || now - lastMs > SESSION_TTL_MS;
    const newBrowserSession = paired && paired !== tabSessionId;

    if (existingId && !expired && !newBrowserSession) {
      localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
      return existingId;
    }

    const next = createClientMetaEventId();
    localStorage.setItem(META_EVENT_ID_STORAGE_KEY, next);
    localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(now));
    localStorage.setItem(META_PAIRED_TAB_SESSION_KEY, tabSessionId);
    return next;
  } catch {
    return createClientMetaEventId();
  }
}

/** Call on meaningful funnel interaction (e.g. checkout CTA) to extend TTL. */
export function touchMetaFunnelActivity(): void {
  if (typeof window === "undefined") return;
  try {
    if (!localStorage.getItem(META_EVENT_ID_STORAGE_KEY)?.trim()) return;
    localStorage.setItem(META_LAST_ACTIVITY_MS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Clears funnel session state so the next visit can start a new attribution session. */
export function clearMetaSessionEventId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_EVENT_ID_STORAGE_KEY);
    localStorage.removeItem(META_LAST_ACTIVITY_MS_KEY);
    localStorage.removeItem(META_PAIRED_TAB_SESSION_KEY);
  } catch {
    // ignore
  }
}
