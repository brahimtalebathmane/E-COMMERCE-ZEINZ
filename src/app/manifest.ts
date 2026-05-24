import type { MetadataRoute } from "next";
import { BRAND_COLOR, BRAND_NAME } from "@/lib/site-branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${BRAND_NAME} — Shop`,
    short_name: BRAND_NAME,
    description: "ZEINZ e-commerce storefront, product landings, and checkout.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait-primary",
    theme_color: BRAND_COLOR,
    background_color: "#ffffff",
    lang: "ar",
    dir: "rtl",
    categories: ["shopping", "business"],
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
