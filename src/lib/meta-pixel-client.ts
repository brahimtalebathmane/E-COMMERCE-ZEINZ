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

function ensurePixelInit(pixelId: string): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  ensureFbqQueue();

  window.__metaPixelsInited = window.__metaPixelsInited || {};
  if (!window.__metaPixelsInited[id]) {
    window.fbq!("init", id);
    window.__metaPixelsInited[id] = true;
    devLog("init queued", { pixelId: id });
  }

  return id;
}

function pushFbqTrack(
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  if (!window.fbq) return;

  if (payload && opts) {
    window.fbq("track", eventName, payload, opts);
  } else if (opts) {
    window.fbq("track", eventName, {}, opts);
  } else if (payload) {
    window.fbq("track", eventName, payload);
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
  console.error("[DEBUG-PIXEL] trackMetaPageView invoked", { pixelId, resolvedId: id });
  if (!id || typeof window === "undefined") {
    console.error("[DEBUG-PIXEL] trackMetaPageView aborted — missing pixel ID or not in browser");
    return;
  }

  ensureFbqQueue();

  if (!window.__metaPixelsInited) window.__metaPixelsInited = {};
  if (!window.__metaPixelsInited[id]) {
    window.fbq!("init", id);
    window.__metaPixelsInited[id] = true;
    devLog("init queued", { pixelId: id });
  }

  const key = `${id}:${window.location.pathname}`;
  if (window.__metaPixelPageViewSent?.[key]) {
    devLog("PageView skipped (already queued for route)", { pixelId: id, key });
    return;
  }

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
  opts?: { eventID?: string },
): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const ready = ensurePixelInit(id);
  if (!ready || !window.fbq) return;

  pushFbqTrack(eventName, payload, opts);

  devLog(`${eventName} queued`, {
    pixelId: id,
    queueLength: window.fbq.queue?.length ?? 0,
    eventID: opts?.eventID,
    hasPayload: Boolean(payload && Object.keys(payload).length > 0),
  });
}
