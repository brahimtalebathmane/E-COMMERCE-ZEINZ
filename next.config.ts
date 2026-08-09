import type { NextConfig } from "next";
import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const supabaseStorageHostname = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Admin-only scope: storefront checkout (/order-success) must never be intercepted by the PWA worker.
  scope: "/admin/",
  // Off: precaching App Router navigations breaks dynamic routes (e.g. /order-success?tokens).
  cacheOnNavigation: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/icons/logo-zeina.png", revision },
    // ?v=2 keeps the precached URLs in lockstep with the rebranded manifest/metadata icon refs.
    { url: "/icons/icon-192.png?v=2", revision },
    { url: "/icons/icon-512.png?v=2", revision },
  ],
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon.png",
        permanent: false,
      },
    ];
  },
  async headers() {
    // Report-only for now — collect real-world violation reports for a
    // week before flipping this to an enforcing `Content-Security-Policy`
    // header. The Meta Pixel bootstrap (src/lib/meta-pixel-bootstrap.ts,
    // MetaPixelLandingScript.tsx) uses dangerouslySetInnerHTML for an
    // inline <script>, hence 'unsafe-inline' on script-src below; migrating
    // both call sites to a per-request nonce (threaded through
    // src/middleware.ts) is the follow-up hardening step that lets us drop
    // it before enforcing.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.facebook.com https://cdn.onesignal.com https://*.onesignal.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.supabase.co https://i.postimg.cc https://image.mux.com https://www.facebook.com",
      "media-src 'self' https://*.supabase.co https://stream.mux.com https://*.mux.com",
      "frame-src 'self' https://iframe.videodelivery.net https://*.cloudflarestream.com https://player.mux.com",
      "connect-src 'self' https://*.supabase.co https://connect.facebook.net https://www.facebook.com https://stream.mux.com https://*.mux.com https://cdn.onesignal.com https://*.onesignal.com",
    ].join("; ");

    return [
      {
        // Applies to every route (storefront, admin, API). Individual
        // route handlers may still set their own headers on top of these.
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      {
        // The OneSignal push worker lives in the nested /push/ subdirectory. iOS Safari
        // and Android Chrome only let a worker control a scope at or below its own path,
        // so without this header strict browsers reject any broader registration and the
        // background push listener never activates. Allowing root scope keeps registration
        // resilient regardless of the scope OneSignal requests, while no-cache guarantees a
        // deploy ships a fresh worker instead of a stale one that silently drops pushes.
        source: "/push/OneSignalSDKWorker.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [390, 428, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24,
    // Narrowed from hostname: "**" (any HTTPS host — an open SSRF/bandwidth
    // proxy through the Netlify image function) to the hosts actually
    // referenced by live product media, verified against production
    // (2026-08-09): the Supabase storage host (127 refs, the
    // public-assets/user-assets buckets, derived from
    // NEXT_PUBLIC_SUPABASE_URL below), i.postimg.cc (29 refs, legacy
    // externally-hosted images), image.mux.com (Mux-generated video poster
    // thumbnails). If an admin pastes a testimonial/media image from a new
    // host, next/image will refuse it until that host is added here — the
    // intended trade-off for closing the SSRF hole. Prefer routing new
    // uploads through POST /api/admin/upload-image (Supabase storage) over
    // pasting arbitrary external URLs.
    remotePatterns: [
      ...(supabaseStorageHostname
        ? [{ protocol: "https" as const, hostname: supabaseStorageHostname }]
        : []),
      { protocol: "https", hostname: "i.postimg.cc" },
      { protocol: "https", hostname: "image.mux.com" },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "sonner",
      "@mux/mux-player-react",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
    // Keep visited dashboard panels warm in the client-side Router Cache. The
    // admin pages are `force-dynamic`, so Next 15 defaults `staleTimes.dynamic`
    // to 0 and discards each panel's RSC payload the moment you leave it — every
    // re-visit then re-runs middleware auth + full Supabase fetches, which is the
    // root cause of the sidebar navigation lag. Caching the payload for a few
    // minutes makes switching back to a previously opened menu instant. Data
    // stays correct because every mutation calls `revalidatePath` (which evicts
    // the cache) and the live panels (orders) subscribe to Supabase realtime.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
};

export default withSerwist(nextConfig);
