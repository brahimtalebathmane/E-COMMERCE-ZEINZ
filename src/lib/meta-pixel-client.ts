import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

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

function isSdkReady(): boolean {
  return typeof window.fbq?.callMethod === "function";
}

function bootstrapFbqStub(): void {
  if (window.fbq) return;
  const n = function (this: FbqFn, ...args: unknown[]) {
    if (n.callMethod) {
      n.callMethod(...args);
    } else {
      n.queue.push(args);
    }
  } as FbqFn;
  n.queue = [];
  window.fbq = n;
  window._fbq = n;
}

/** Start loading fbevents.js in the background; never blocks event queueing. */
function injectFbeventsScript(): void {
  if (typeof window === "undefined") return;
  if (isSdkReady()) return;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src*="connect.facebook.net"][src*="fbevents.js"]',
  );
  if (existing) return;

  bootstrapFbqStub();
  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  script.onerror = () => {
    if (isDev) {
      console.warn("[Meta Pixel] fbevents.js blocked — disable ad blockers for this site.");
    }
  };
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    document.head.appendChild(script);
  }
}

/**
 * Ensures fbq stub + pixel init exist, starts SDK load. Does not wait for callMethod.
 * Events should be queued via fbq() immediately after this returns.
 */
export function ensureMetaPixelSdk(pixelId: string): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  bootstrapFbqStub();
  injectFbeventsScript();

  window.__metaPixelsInited = window.__metaPixelsInited || {};
  if (!window.__metaPixelsInited[id]) {
    window.fbq!("init", id);
    window.__metaPixelsInited[id] = true;
    devLog("init queued", { pixelId: id, sdkReady: isSdkReady() });
  }

  return id;
}

function pageViewKey(pixelId: string): string {
  return `${pixelId}:${window.location.pathname}`;
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

/**
 * Queue PageView on fbq immediately (processed when fbevents.js loads).
 * Dedup flag is set only after the track call is pushed to fbq.
 */
export function trackMetaPageView(pixelId?: string | null): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const key = pageViewKey(id);
  window.__metaPixelPageViewSent = window.__metaPixelPageViewSent || {};
  if (window.__metaPixelPageViewSent[key]) {
    devLog("PageView skipped (already queued for route)", { pixelId: id, key });
    return;
  }

  const ready = ensureMetaPixelSdk(id);
  if (!ready || !window.fbq) return;

  pushFbqTrack("PageView");
  window.__metaPixelPageViewSent[key] = true;

  devLog("PageView queued", {
    pixelId: id,
    key,
    sdkReady: isSdkReady(),
    queueLength: window.fbq.queue?.length ?? 0,
  });
}

/** Queue a standard/custom Meta event on fbq (no wait for SDK readiness). */
export function trackMetaEvent(
  pixelId: string | null | undefined,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id || typeof window === "undefined") return;

  const ready = ensureMetaPixelSdk(id);
  if (!ready || !window.fbq) return;

  pushFbqTrack(eventName, payload, opts);

  devLog(`${eventName} queued`, {
    pixelId: id,
    sdkReady: isSdkReady(),
    queueLength: window.fbq.queue?.length ?? 0,
    eventID: opts?.eventID,
    hasPayload: Boolean(payload && Object.keys(payload).length > 0),
  });
}
