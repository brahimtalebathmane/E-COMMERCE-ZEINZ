import { buildMetaLeadEventId, resolveLeadEventId } from "@/lib/meta-lead-event-id";
import { clearOrderSuccessClientSession } from "@/lib/orders/order-success-session-client";

export { buildMetaLeadEventId, resolveLeadEventId };

export const META_PENDING_LEAD_STORAGE_KEY = "meta_pending_lead_v1";

const META_LEAD_DISPATCHED_PREFIX = "meta_lead_dispatched:";
const META_BROWSER_LEAD_SENT_PREFIX = "meta_browser_lead_sent:";

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
};

export type MetaLeadCapiResult =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string }
  | { state: "error"; reason: string };

/** True when CAPI Lead is done (sent or definitively skipped). */
export function isMetaLeadCapiComplete(result: MetaLeadCapiResult): boolean {
  return result.state === "sent" || result.state === "skipped";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function dispatchedStorageKey(orderId: string): string {
  return `${META_LEAD_DISPATCHED_PREFIX}${orderId.trim()}`;
}

/** True when Lead was already dispatched for this order in this tab session. */
export function isMetaLeadDispatched(orderId: string): boolean {
  if (typeof window === "undefined") return false;
  const id = orderId.trim();
  if (!id) return false;
  try {
    return sessionStorage.getItem(dispatchedStorageKey(id)) === "1";
  } catch {
    return false;
  }
}

export function markMetaLeadDispatched(orderId: string): void {
  if (typeof window === "undefined") return;
  const id = orderId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(dispatchedStorageKey(id), "1");
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Synchronous once-per-order browser Lead lock (survives refresh, blocks async races).
 * Returns false when Lead was already marked for this order in this tab.
 */
export function tryMarkBrowserLeadSent(orderId: string): boolean {
  if (typeof window === "undefined") return false;
  const id = orderId.trim();
  if (!id) return false;
  try {
    const key = `${META_BROWSER_LEAD_SENT_PREFIX}${id}`;
    if (sessionStorage.getItem(key) === "1") return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
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

/** Read pending Lead without removing (safe for StrictMode remounts). */
export function readMetaPendingLead(orderId: string): MetaPendingLeadPayload | null {
  if (typeof window === "undefined") return null;
  const id = orderId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(META_PENDING_LEAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidPayload(parsed) || parsed.orderId.trim() !== id) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** @deprecated Prefer readMetaPendingLead + clearMetaPendingLead after success. */
export function consumeMetaPendingLead(orderId: string): MetaPendingLeadPayload | null {
  const payload = readMetaPendingLead(orderId);
  if (payload) clearMetaPendingLead();
  return payload;
}

export function clearMetaPendingLead(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(META_PENDING_LEAD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type MetaLeadSessionCredentials = {
  completionToken?: string | null;
  actionToken?: string | null;
};

/** Server fallback when sessionStorage pending payload is missing. */
export async function fetchMetaLeadPayloadFromServer(
  orderId: string,
  session?: MetaLeadSessionCredentials,
): Promise<{ payload: MetaPendingLeadPayload | null; metaLeadSent: boolean }> {
  const id = orderId.trim();
  if (!id) return { payload: null, metaLeadSent: false };

  try {
    const res = await fetch("/api/orders/meta/lead-payload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        order_id: id,
        completion_token: session?.completionToken ?? undefined,
        action_token: session?.actionToken ?? undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      payload?: MetaPendingLeadPayload | null;
      meta_lead_sent?: boolean;
    };
    if (!res.ok) {
      return { payload: null, metaLeadSent: false };
    }
    if (json.meta_lead_sent) {
      return { payload: null, metaLeadSent: true };
    }
    const payload = json.payload;
    if (!payload || !isValidPayload(payload) || payload.orderId.trim() !== id) {
      return { payload: null, metaLeadSent: false };
    }
    return { payload, metaLeadSent: false };
  } catch {
    return { payload: null, metaLeadSent: false };
  }
}

/** Marks tab session complete and clears pending payload after hybrid Lead settles. */
export function finalizeMetaLeadDispatch(orderId: string): void {
  markMetaLeadDispatched(orderId);
  clearMetaPendingLead();
  clearOrderSuccessClientSession(orderId);
}

/** Server Lead CAPI — paired with browser Pixel on order-success (cookie session auth). */
export async function dispatchMetaLeadCapi(params: {
  orderId: string;
  eventId: string;
  completionToken?: string | null;
  actionToken?: string | null;
  eventTimeSec?: number;
}): Promise<MetaLeadCapiResult> {
  try {
    const res = await fetch("/api/orders/meta/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        order_id: params.orderId,
        event_id: params.eventId,
        completion_token: params.completionToken ?? undefined,
        action_token: params.actionToken ?? undefined,
        event_time: params.eventTimeSec,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      lead?: MetaLeadCapiResult;
      error?: string;
    };
    if (!res.ok) {
      return { state: "error", reason: json.error ?? `http_${res.status}` };
    }
    if (json.lead?.state) return json.lead;
    return { state: "error", reason: "invalid_response" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Retries transient Lead CAPI failures; skipped/sent return immediately. */
export async function dispatchMetaLeadCapiWithRetry(
  params: {
    orderId: string;
    eventId: string;
    completionToken?: string | null;
    actionToken?: string | null;
    eventTimeSec?: number;
  },
  options: { maxAttempts?: number } = {},
): Promise<MetaLeadCapiResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let last: MetaLeadCapiResult = { state: "error", reason: "not_started" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    last = await dispatchMetaLeadCapi(params);
    if (isMetaLeadCapiComplete(last)) return last;
  }

  return last;
}

/**
 * Resolves Lead payload from sessionStorage or server, without consuming storage
 * until dispatch succeeds.
 */
export async function resolveMetaLeadPayload(
  orderId: string,
  session?: MetaLeadSessionCredentials,
): Promise<{ payload: MetaPendingLeadPayload | null; metaLeadSent: boolean }> {
  const fromStorage = readMetaPendingLead(orderId);
  if (fromStorage) {
    return { payload: fromStorage, metaLeadSent: false };
  }
  return fetchMetaLeadPayloadFromServer(orderId, session);
}
