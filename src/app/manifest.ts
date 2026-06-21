import type { MetadataRoute } from "next";
import { BRAND_COLOR, BRAND_NAME } from "@/lib/site-branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Admin-only utility app: installs and launches straight into the dashboard.
    id: "/admin",
    name: `${BRAND_NAME} — Admin`,
    short_name: `${BRAND_NAME} Admin`,
    description: "ZAINE admin dashboard — manage products, orders, and landings.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait-primary",
    theme_color: BRAND_COLOR,
    background_color: "#ffffff",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
