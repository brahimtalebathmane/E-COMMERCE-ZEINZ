import {
  buildMetaPixelInitUserData,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: FbqFn;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
  getState?: () => { pixels?: Array<{ id?: string }> };
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    __metaPixelsInited?: Record<string, boolean>;
    /** Pixel IDs that received manual AM (ph/fn/ln) on fbq init — per pixel, site-wide. */
    __metaPixelInitHadPii?: Record<string, boolean>;
    __metaPixelPageViewSent?: Record<string, boolean>;
    /** `${pixelId}:${eventName}:${eventID}` keys already dispatched, to guarantee once-per-action. */
    __metaSentEvents?: Record<string, boolean>;
  }
}

const isDev = process.env.NODE_ENV === "development";

function devLog(message: string, data?: Record<string, unknown>): void {
  if (!isDev) return;
  if (data) {
    console.log(`[Meta Pixel] ${message}`, data);
  } else {
    console.log(`[Meta Pixel] ${message}`);
  }
}

/** Load official fbq bootstrap if root layout script has not run yet. */
function ensureFbqQueue(): void {
  if (typeof window === "undefined" || window.fbq) return;

  (function (f, b, e, v) {
    if (f.fbq) return;
    const n = function (...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    } as FbqFn;
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    // Stop Meta's automatic PageView on history.pushState — we fire one manually per route.
    n.disablePushState = true;
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    if (s?.parentNode) s.parentNode.insertBefore(t, s);
    else (b.head || b.documentElement).appendChild(t);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
}

function initUserDataHasPii(userData?: Record<string, string>): boolean {
  return Boolean(userData?.ph || userData?.fn || userData?.ln || userData?.em);
}

/** Disable Meta's automatic PageView on `fbq('init')` — we fire exactly one manually per route. */
const FBQ_INIT_OPTS = { autoConfig: false, xfbml: false } as const;

/** Module-level init lock — survives HMR and complements window.__metaPixelsInited. */
const initedPixelIds = new Set<string>();

function isInitPendingInFbqQueue(pixelId: string): boolean {
  const queue = window.fbq?.queue;
  if (!Array.isArray(queue)) return false;
  return queue.some(
    (entry) => Array.isArray(entry) && entry[0] === "init" && String(entry[1]) === pixelId,
  );
}

function countFbqPixelRegistrations(pixelId: string): number {
  try {
    const pixels = window.fbq?.getState?.()?.pixels;
    if (!Array.isArray(pixels)) return 0;
    const id = String(pixelId);
    return pixels.filter((pixel) => String(pixel?.id) === id).length;
  } catch {
    return 0;
  }
}

function isFbqPixelRegistered(pixelId: string): boolean {
  return countFbqPixelRegistrations(pixelId) > 0;
}

/** Sync module/window init flags when fbq already registered this pixel (SPA navigation). */
function syncInitedFromFbqState(pixelId: string): boolean {
  if (!isFbqPixelRegistered(pixelId)) return false;
  markMetaPixelInited(pixelId);
  return true;
}

function markMetaPixelInited(pixelId: string): void {
  initedPixelIds.add(pixelId);
  window.__metaPixelsInited = window.__metaPixelsInited || {};
  window.__metaPixelsInited[pixelId] = true;
}

function isMetaPixelInited(pixelId: string): boolean {
  return (
    initedPixelIds.has(pixelId) ||
    Boolean(window.__metaPixelsInited?.[pixelId]) ||
    isFbqPixelRegistered(pixelId) ||
    isInitPendingInFbqQueue(pixelId)
  );
}

function pageViewDedupeKey(pixelId: string): string {
  const path = window.location.pathname;
  const search = window.location.search;
  return `${pixelId}:${path}${search}`;
}

function queueMetaPixelInit(
  id: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  ensureFbqQueue();
  if (!window.fbq) return;

  syncInitedFromFbqState(id);

  if (isMetaPixelInited(id)) {
    devLog("init skipped (already registered or pending)", { pixelId: id });
    return;
  }

  if (countFbqPixelRegistrations(id) > 0) {
    markMetaPixelInited(id);
    devLog("init skipped (pixel already in fbq state)", { pixelId: id });
    return;
  }

  // Reserve the init slot synchronously so concurrent callers cannot queue a second init.
  markMetaPixelInited(id);

  // Meta expects the string 'false' here — boolean false does not always disable auto PageView.
  window.fbq.disablePushState = true;
  window.fbq("set", "autoConfig", "false", id);

  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData) {
    window.fbq("init", id, userData, FBQ_INIT_OPTS);
  } else {
    window.fbq("init", id, {}, FBQ_INIT_OPTS);
  }
  if (initUserDataHasPii(userData)) {
    window.__metaPixelInitHadPii = window.__metaPixelInitHadPii || {};
    window.__metaPixelInitHadPii[id] = true;
  }
  devLog("init queued", {
    pixelId: id,
    hasInitUserData: Boolean(userData),
    hasPii: initUserDataHasPii(userData),
  });
}

/**
 * Initialize each pixel ID EXACTLY once per page session.
 *
 * Calling `fbq('init', id)` more than once for the same ID registers the pixel a
 * second time inside fbevents.js, which makes every untargeted `fbq('track', …)`
 * (and even `trackSingle`) fire twice. Advanced matching that arrives after the
 * first init is therefore applied via the supported `fbq('set', 'userData', …)`
 * path instead of a re-init, so events are never duplicated.
 *
 * Each product landing uses its own meta_pixel_id from admin (keyed separately in sessionStorage).
 */
function syncMetaPixelInit(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  ensureFbqQueue();

  syncInitedFromFbqState(id);

  if (!isMetaPixelInited(id)) {
    queueMetaPixelInit(id, extra);
    return id;
  }

  // Already initialized: NEVER re-init. Push any newer advanced matching through
  // `set` so it attaches to subsequent events without re-registering the pixel.
  markMetaPixelInited(id);
  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData && window.fbq) {
    // Meta accepts only fbq('set', 'userData', object) — no pixel_id 4th argument.
    window.fbq("set", "userData", userData);
    if (initUserDataHasPii(userData)) {
      window.__metaPixelInitHadPii = window.__metaPixelInitHadPii || {};
      window.__metaPixelInitHadPii[id] = true;
    }
  }

  return id;
}

function ensurePixelInit(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): string | null {
  return syncMetaPixelInit(pixelId, extra);
}

/** Re-run init with manual advanced matching (Meta requires PII in the init third argument). */
export function refreshMetaPixelInitWithUserData(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  syncMetaPixelInit(pixelId, extra);
}

const META_TRACKED_EVENT_STORAGE_PREFIX = "meta_tracked_event_v1:";
const META_PAGEVIEW_STORAGE_PREFIX = "meta_pageview_v1:";

/** True when this exact (pixel, event, eventID) was already dispatched in this tab. */
function isDuplicateTrackedEvent(
  pixelId: string,
  eventName: string,
  eventID?: string,
): boolean {
  if (!eventID || typeof window === "undefined") return false;
  const memKey = `${pixelId}:${eventName}:${eventID}`;
  const storageKey = `${META_TRACKED_EVENT_STORAGE_PREFIX}${memKey}`;

  try {
    if (sessionStorage.getItem(storageKey) === "1") return true;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    if (window.__metaSentEvents?.[memKey]) return true;
    if (!window.__metaSentEvents) window.__metaSentEvents = {};
    window.__metaSentEvents[memKey] = true;
    return false;
  }

  if (!window.__metaSentEvents) window.__metaSentEvents = {};
  window.__metaSentEvents[memKey] = true;
  return false;
}

function pushFbqTrack(
  pixelId: string,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  if (!window.fbq) return;

  // Guarantee a given user action (identified by eventID) fires once per session,
  // so rapid double-taps / re-renders cannot emit the same Lead/InitiateCheckout twice.
  if (isDuplicateTrackedEvent(pixelId, eventName, opts?.eventID)) {
    devLog(`${eventName} skipped (duplicate eventID)`, { pixelId, eventID: opts?.eventID });
    return;
  }

  const duplicateRegistrations = countFbqPixelRegistrations(pixelId);
  if (duplicateRegistrations > 1) {
    console.warn(
      `[Meta Pixel] ${eventName} may duplicate — pixel ${pixelId} registered ${duplicateRegistrations}x in fbq (avoid calling fbq init twice)`,
    );
  }

  // Always target the specific pixel (`trackSingle`). Untargeted `fbq('track', …)`
  // dispatches to every registered pixel instance and is the main duplication vector.
  // userData is applied in syncMetaPixelInit before this call — do not set again here.
  const trackPayload = payload ?? {};
  if (opts?.eventID) {
    window.fbq("trackSingle", pixelId, eventName, trackPayload, { eventID: opts.eventID });
  } else {
    window.fbq("trackSingle", pixelId, eventName, trackPayload);
  }

  devLog(`${eventName} trackSingle queued`, {
    pixelId,
    eventID: opts?.eventID,
  });
}

/** @deprecated Use trackMetaPageView / trackMetaEvent; kept for callers that awaited init. */
export function ensureMetaPixelSdk(pixelId: string): string | null {
  return ensurePixelInit(pixelId);
}

export function trackMetaPageView(pixelId?: string | null): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const key = pageViewDedupeKey(id);
  const storageKey = `${META_PAGEVIEW_STORAGE_PREFIX}${key}`;

  try {
    if (sessionStorage.getItem(storageKey) === "1") {
      devLog("PageView skipped (already sent for route)", { pixelId: id, key });
      return;
    }
  } catch {
    // ignore private mode / quota
  }

  if (window.__metaPixelPageViewSent?.[key]) {
    devLog("PageView skipped (already queued for route)", { pixelId: id, key });
    return;
  }

  // Lock synchronously BEFORE init/track so StrictMode remounts and concurrent
  // effect invocations cannot pass the guard in the same tick.
  if (!window.__metaPixelPageViewSent) window.__metaPixelPageViewSent = {};
  window.__metaPixelPageViewSent[key] = true;
  try {
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // ignore
  }

  const ready = syncMetaPixelInit(id);
  if (!ready || !window.fbq) return;

  // Synthetic eventID per route so pushFbqTrack dedupe blocks any second PageView dispatch.
  pushFbqTrack(id, "PageView", undefined, { eventID: `pv:${key}` });

  devLog("PageView queued", {
    pixelId: id,
    key,
    queueLength: window.fbq?.queue?.length ?? 0,
  });
}

export function trackMetaEvent(
  pixelId: string | null | undefined,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string; advancedMatching?: MetaPixelAdvancedMatchingPayload | null },
): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const ready = syncMetaPixelInit(id, opts?.advancedMatching);
  if (!ready || !window.fbq) return;

  pushFbqTrack(
    id,
    eventName,
    payload,
    opts?.eventID ? { eventID: opts.eventID } : undefined,
  );

  devLog(`${eventName} queued`, {
    pixelId: id,
    queueLength: window.fbq.queue?.length ?? 0,
    eventID: opts?.eventID,
    hasPayload: Boolean(payload && Object.keys(payload).length > 0),
  });
}

/** Outcome of the dedicated browser Lead path (never shares pushFbqTrack with other events). */
export type TrackMetaLeadResult =
  | { sent: true }
  | { sent: false; reason: string };

function waitForFbqPixelRegistration(pixelId: string, maxMs = 2500): Promise<number> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const count = countFbqPixelRegistrations(pixelId);
      const pending = isInitPendingInFbqQueue(pixelId);
      const elapsed = Date.now() - started;
      if (count > 0 || (!pending && elapsed > 200) || elapsed >= maxMs) {
        resolve(count);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Single-path browser Lead — one userData update, one trackSingle, no applyMetaPixelUserData.
 * Skips browser Lead when fbq has duplicate pixel registrations (trackSingle would emit twice).
 */
export async function trackMetaLead(
  pixelId: string,
  payload: Record<string, unknown>,
  opts: { eventID: string; advancedMatching?: MetaPixelAdvancedMatchingPayload | null },
): Promise<TrackMetaLeadResult> {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") {
    return { sent: false, reason: "no_pixel" };
  }

  ensureFbqQueue();
  syncMetaPixelInit(id, opts.advancedMatching);

  const regCount = await waitForFbqPixelRegistration(id);
  if (regCount > 1) {
    console.warn(
      `[Meta Pixel] Skipping browser Lead — pixel ${id} registered ${regCount}x in fbq; CAPI Lead will still fire`,
    );
    return { sent: false, reason: "duplicate_pixel_registration" };
  }

  if (isDuplicateTrackedEvent(id, "Lead", opts.eventID)) {
    return { sent: false, reason: "duplicate_event_id" };
  }

  if (!window.fbq) {
    return { sent: false, reason: "fbq_unavailable" };
  }

  window.fbq("trackSingle", id, "Lead", payload, { eventID: opts.eventID });
  devLog("Lead trackSingle queued (dedicated path)", {
    pixelId: id,
    eventID: opts.eventID,
    regCount,
  });

  return { sent: true };
}
