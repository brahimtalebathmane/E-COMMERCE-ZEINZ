import type { NextConfig } from "next";

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
        destination: "/icon.svg",
        permanent: false,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [390, 428, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
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

export default nextConfig;
