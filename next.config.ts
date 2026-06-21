import type { NextConfig } from "next";
import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
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
    return [
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
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    optimizePackageImports: [
      "sonner",
      "@mux/mux-player-react",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
  },
};

export default withSerwist(nextConfig);
