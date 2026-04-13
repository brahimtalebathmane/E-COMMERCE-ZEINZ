export const META_EVENT_ID_STORAGE_KEY = "meta_event_id_session";

export function createClientMetaEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${Date.now()}_${crypto.randomUUID()}`;
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Clears the funnel session id so the next visit can start a new attribution session. */
export function clearMetaSessionEventId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_EVENT_ID_STORAGE_KEY);
  } catch {
    // ignore
  }
}
