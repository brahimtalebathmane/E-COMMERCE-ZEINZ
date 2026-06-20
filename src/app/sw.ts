import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Dynamic / tokenized pages must always hit the network (App Router + query strings). */
function isNetworkOnlyDocument(url: URL): boolean {
  if (url.pathname === "/order-success") return true;
  if (url.pathname.startsWith("/admin")) return true;
  return false;
}

/** Tokenized checkout pages must not be cached — bypass SW when network fails. */
function isBypassDocument(url: URL): boolean {
  return url.pathname === "/order-success";
}

const networkOnlyPages = [
  {
    matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      sameOrigin && isNetworkOnlyDocument(url),
    handler: new NetworkOnly(),
  },
] as const;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...networkOnlyPages, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          const url = new URL(request.url);
          return (
            request.destination === "document" &&
            !isNetworkOnlyDocument(url) &&
            !isBypassDocument(url)
          );
        },
      },
    ],
  },
});

/** Pass tokenized checkout navigations straight to the network (no Workbox no-response). */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  const url = new URL(event.request.url);
  if (!isBypassDocument(url)) return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response("Unable to reach checkout page.", { status: 503 }),
    ),
  );
});

serwist.addEventListeners();
