import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** This PWA is an admin utility: the dashboard and its dynamic views are the app surface. */
function isAdminDocument(url: URL): boolean {
  return url.pathname === "/admin" || url.pathname.startsWith("/admin/");
}

/** Dynamic / tokenized pages must always hit the network (App Router + query strings). */
function isNetworkOnlyDocument(url: URL): boolean {
  if (url.pathname === "/order-success") return true;
  if (isAdminDocument(url)) return true;
  return false;
}

function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith("/api/");
}

const networkOnlyPages = [
  {
    matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      sameOrigin && (isNetworkOnlyDocument(url) || isApiRequest(url)),
    handler: new NetworkOnly(),
  },
] as const;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Off: preload rejections surface as `no-response` when the network blips (see serwist#194).
  navigationPreload: false,
  runtimeCaching: [...networkOnlyPages, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        // Serve the offline shell for any document navigation that errors offline,
        // including the network-only admin dashboard views (the PWA's core scope).
        matcher({ request }) {
          if (request.destination !== "document") return false;
          const url = new URL(request.url);
          // The tokenized order-success page is intentionally excluded.
          return isAdminDocument(url) || !isNetworkOnlyDocument(url);
        },
      },
    ],
  },
});

serwist.addEventListeners();
