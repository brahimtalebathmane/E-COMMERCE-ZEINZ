import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { BRAND_NAME } from "@/lib/site-branding";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
});

// Link the web app manifest only under /admin so the installable PWA launches into
// the dashboard and is never surfaced as an install prompt on the public storefront.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: {
    default: `${BRAND_NAME} — Admin`,
    template: `%s — ${BRAND_NAME} Admin`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: `${BRAND_NAME} Admin`,
  },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${geistMono.variable} min-h-0`}>{children}</div>;
}
