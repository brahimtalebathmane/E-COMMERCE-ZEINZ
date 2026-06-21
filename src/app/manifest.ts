import type { MetadataRoute } from "next";
import { BRAND_COLOR, BRAND_NAME } from "@/lib/site-branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Admin-only utility app: installs and launches straight into the dashboard.
    // id/scope stay at "/" so the installed PWA keeps the same stable identity that
    // existing mobile push subscriptions were created under, and so the OneSignal push
    // worker at "/push/" remains inside the app's navigation scope. iOS/WebKit refuses
    // to deliver Web Push when the push service worker falls outside the manifest scope,
    // which is what silenced mobile notifications when scope was narrowed to "/admin".
    id: "/",
    name: `${BRAND_NAME} — Admin`,
    short_name: `${BRAND_NAME} Admin`,
    description: "ZAINE admin dashboard — manage products, orders, and landings.",
    // start_url stays under /admin so launching the installed app opens the dashboard,
    // while scope "/" keeps the push worker and the whole admin surface in scope.
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait-primary",
    theme_color: BRAND_COLOR,
    // Black to match the new black-background app icon so the install splash stays cohesive.
    background_color: "#000000",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    // The ?v= query busts stale OS/browser icon caches whenever the asset is rebranded.
    icons: [
      {
        src: "/icons/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
