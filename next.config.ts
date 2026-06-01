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
    { url: "/icons/icon-192.png", revision },
    { url: "/icons/icon-512.png", revision },
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
