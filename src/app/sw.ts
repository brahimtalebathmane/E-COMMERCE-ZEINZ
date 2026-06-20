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
          return (
            request.destination === "document" &&
            !isNetworkOnlyDocument(new URL(request.url))
          );
        },
      },
    ],
  },
});

serwist.addEventListeners();
