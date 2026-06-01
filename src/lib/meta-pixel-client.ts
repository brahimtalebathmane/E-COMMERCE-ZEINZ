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

/** Load official fbq bootstrap if root layout Script has not run yet. */
function ensureFbqQueue(): void {
  if (typeof window === "undefined" || window.fbq) return;

  // Inject the full official Meta Pixel bootstrap to bypass the early-return guard bug
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function (...args: unknown[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    if (s && s.parentNode) s.parentNode.insertBefore(t, s);
    else (b.head || b.documentElement).appendChild(t);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
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
  if (!id || typeof window === "undefined") return;

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
