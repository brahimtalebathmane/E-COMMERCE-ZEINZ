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

function queueMetaPixelInit(
  id: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData) {
    window.fbq!("init", id, userData);
  } else {
    window.fbq!("init", id);
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
 * Init each pixel once; re-init when manual AM (ph/fn/ln) becomes available.
 * Each product landing uses its own meta_pixel_id from admin (keyed separately in sessionStorage).
 */
function syncMetaPixelInit(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  ensureFbqQueue();

  const initData = buildMetaPixelInitUserData(id, extra);
  const hasPii = initUserDataHasPii(initData);
  const wasInited = window.__metaPixelsInited?.[id];
  const hadPiiInit = window.__metaPixelInitHadPii?.[id];

  if (!wasInited || extra || (hasPii && !hadPiiInit)) {
    queueMetaPixelInit(id, extra);
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

function pushFbqTrack(
  pixelId: string,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  if (!window.fbq) return;

  applyMetaPixelUserData(pixelId);

  const trackPayload = payload ?? {};
  if (opts?.eventID) {
    window.fbq("trackSingle", pixelId, eventName, trackPayload, { eventID: opts.eventID });
    return;
  }
  if (payload && Object.keys(trackPayload).length > 0) {
    window.fbq("track", eventName, trackPayload);
  } else if (payload) {
    window.fbq("track", eventName, trackPayload);
  } else {
    window.fbq("track", eventName);
  }
}

/** @deprecated Use trackMetaPageView / trackMetaEvent; kept for callers that awaited init. */
export function ensureMetaPixelSdk(pixelId: string): string | null {
  return ensurePixelInit(pixelId);
}

export function trackMetaPageView(pixelId?: string | null): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const ready = syncMetaPixelInit(id);
  if (!ready || !window.fbq) return;

  const key = `${id}:${window.location.pathname}`;
  if (window.__metaPixelPageViewSent?.[key]) {
    devLog("PageView skipped (already queued for route)", { pixelId: id, key });
    return;
  }

  applyMetaPixelUserData(id);
  window.fbq!("track", "PageView");

  if (!window.__metaPixelPageViewSent) window.__metaPixelPageViewSent = {};
  window.__metaPixelPageViewSent[key] = true;

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
