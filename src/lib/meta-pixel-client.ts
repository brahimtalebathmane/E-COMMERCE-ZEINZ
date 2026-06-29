import {
  buildMetaPixelInitUserData,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
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

/** Minimal queue stub if root layout Script has not run yet. */
function ensureFbqQueue(): void {
  if (typeof window === "undefined" || window.fbq) return;

  const stub = function (this: FbqFn, ...args: unknown[]) {
    stub.queue.push(args);
  } as FbqFn;
  stub.queue = [];
  window.fbq = stub;
  window._fbq = stub;
}

function initUserDataHasPii(userData?: Record<string, string>): boolean {
  return Boolean(userData?.ph || userData?.fn || userData?.ln || userData?.em);
}

/** Apply stored + cookie user data for a specific pixel before tracked events. */
function applyMetaPixelUserData(pixelId: string): void {
  if (typeof window === "undefined" || !window.fbq) return;
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return;
  const userData = buildMetaPixelInitUserData(id);
  if (!userData) return;
  window.fbq("set", "userData", userData);
}

/** Disable Meta's automatic PageView on `fbq('init')` — we fire exactly one manually per route. */
const FBQ_INIT_OPTS = { autoConfig: false } as const;

function pageViewDedupeKey(pixelId: string): string {
  const path = window.location.pathname;
  const search = window.location.search;
  return `${pixelId}:${path}${search}`;
}

function queueMetaPixelInit(
  id: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData) {
    window.fbq!("init", id, userData, FBQ_INIT_OPTS);
  } else {
    window.fbq!("init", id, {}, FBQ_INIT_OPTS);
  }
  window.__metaPixelsInited = window.__metaPixelsInited || {};
  window.__metaPixelsInited[id] = true;
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

  if (!window.__metaPixelsInited?.[id]) {
    queueMetaPixelInit(id, extra);
    return id;
  }

  // Already initialized: NEVER re-init. Push any newer advanced matching through
  // `set` so it attaches to subsequent events without re-registering the pixel.
  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData && window.fbq) {
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

/** True when this exact (pixel, event, eventID) was already dispatched in this page session. */
function isDuplicateTrackedEvent(
  pixelId: string,
  eventName: string,
  eventID?: string,
): boolean {
  if (!eventID || typeof window === "undefined") return false;
  const key = `${pixelId}:${eventName}:${eventID}`;
  if (window.__metaSentEvents?.[key]) return true;
  if (!window.__metaSentEvents) window.__metaSentEvents = {};
  window.__metaSentEvents[key] = true;
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

  applyMetaPixelUserData(pixelId);

  // Always target the specific pixel (`trackSingle`). Untargeted `fbq('track', …)`
  // dispatches to every registered pixel instance and is the main duplication vector.
  const trackPayload = payload ?? {};
  if (opts?.eventID) {
    window.fbq("trackSingle", pixelId, eventName, trackPayload, { eventID: opts.eventID });
  } else {
    window.fbq("trackSingle", pixelId, eventName, trackPayload);
  }
}

/** @deprecated Use trackMetaPageView / trackMetaEvent; kept for callers that awaited init. */
export function ensureMetaPixelSdk(pixelId: string): string | null {
  return ensurePixelInit(pixelId);
}

export function trackMetaPageView(pixelId?: string | null): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const key = pageViewDedupeKey(id);
  if (window.__metaPixelPageViewSent?.[key]) {
    devLog("PageView skipped (already queued for route)", { pixelId: id, key });
    return;
  }

  // Lock synchronously BEFORE init/track so StrictMode remounts and concurrent
  // effect invocations cannot pass the guard in the same tick.
  if (!window.__metaPixelPageViewSent) window.__metaPixelPageViewSent = {};
  window.__metaPixelPageViewSent[key] = true;

  const ready = syncMetaPixelInit(id);
  if (!ready || !window.fbq) return;

  applyMetaPixelUserData(id);
  // Target this pixel only so a single PageView never fans out to stray registrations.
  window.fbq!("trackSingle", id, "PageView");

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
