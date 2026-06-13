/** Browser Lead payload queued until order-success (avoids losing fbq on navigation). */

export type PendingBrowserLead = {
  eventId: string;
  value: number;
  currency: string;
  pixelId: string | null;
  phone: string;
  customerName: string;
};

const PENDING_KEY = "meta_lead_pending";
const SENT_PREFIX = "meta_lead_browser_sent:";

export function storePendingBrowserLead(payload: PendingBrowserLead): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readPendingBrowserLead(): PendingBrowserLead | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBrowserLead;
    if (!parsed.eventId?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBrowserLead(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export function browserLeadSentKey(eventId: string): string {
  return `${SENT_PREFIX}${eventId}`;
}

export function hasBrowserLeadBeenSent(eventId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(browserLeadSentKey(eventId)) === "1";
  } catch {
    return false;
  }
}

export function markBrowserLeadSent(eventId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(browserLeadSentKey(eventId), "1");
  } catch {
    // ignore
  }
}
