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

function injectFbeventsScript(): Promise<void> {
  return new Promise((resolve) => {
    if (isSdkReady()) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="connect.facebook.net"][src*="fbevents.js"]',
    );
    if (existing) {
      const start = Date.now();
      const tick = () => {
        if (isSdkReady() || Date.now() - start > 10_000) {
          resolve();
          return;
        }
        window.setTimeout(tick, 50);
      };
      tick();
      return;
    }

    bootstrapFbqStub();
    const script = document.createElement("script");
    script.async = true;
    script.src = FBEVENTS_SRC;
    script.onload = () => {
      const start = Date.now();
      const tick = () => {
        if (isSdkReady() || Date.now() - start > 10_000) {
          resolve();
          return;
        }
        window.setTimeout(tick, 50);
      };
      tick();
    };
    script.onerror = () => {
      console.warn("[Meta Pixel] fbevents.js blocked — disable ad blockers for this site.");
      resolve();
    };
    const first = document.getElementsByTagName("script")[0];
    if (first?.parentNode) {
      first.parentNode.insertBefore(script, first);
    } else {
      document.head.appendChild(script);
    }
  });
}

/** Load Meta SDK and ensure this pixel id is initialized. */
export async function ensureMetaPixelSdk(pixelId: string): Promise<string | null> {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  bootstrapFbqStub();
  await injectFbeventsScript();

  window.__metaPixelsInited = window.__metaPixelsInited || {};
  if (!window.__metaPixelsInited[id]) {
    window.fbq!("init", id);
    window.__metaPixelsInited[id] = true;
  }

  if (!isSdkReady()) {
    console.warn("[Meta Pixel] SDK not ready — events may not reach Meta.");
    return id;
  }

  return id;
}

function pageViewKey(pixelId: string): string {
  return `${pixelId}:${window.location.pathname}`;
}

export async function trackMetaPageView(pixelId?: string | null): Promise<void> {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id) return;

  const ready = await ensureMetaPixelSdk(id);
  if (!ready || !window.fbq) return;

  const key = pageViewKey(id);
  window.__metaPixelPageViewSent = window.__metaPixelPageViewSent || {};
  if (window.__metaPixelPageViewSent[key]) return;

  window.fbq("track", "PageView");
  window.__metaPixelPageViewSent[key] = true;
}

export async function trackMetaEvent(
  pixelId: string | null | undefined,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): Promise<void> {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id) return;

  const ready = await ensureMetaPixelSdk(id);
  if (!ready || !window.fbq) return;

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
