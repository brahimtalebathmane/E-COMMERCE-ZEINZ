import type { Metadata, Viewport } from "next";
import { Geist, Tajawal } from "next/font/google";
import { META_PIXEL_BOOTSTRAP_JS } from "@/lib/meta-pixel-bootstrap";
import { BRAND_COLOR, BRAND_NAME } from "@/lib/site-branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const tajawal = Tajawal({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const APP_DESCRIPTION =
  "ZAINE e-commerce storefront, product landings, and secure checkout.";

export const metadata: Metadata = {
  applicationName: BRAND_NAME,
  title: {
    default: `${BRAND_NAME} — Shop`,
    template: `%s — ${BRAND_NAME}`,
  },
  description: APP_DESCRIPTION,
  // The web app manifest is intentionally scoped to /admin (see src/app/admin/layout.tsx)
  // so the installable PWA is an admin-only utility and never prompts on the storefront.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  // ?v=2 busts stale favicon/touch-icon caches after the rebrand to the black-background logo.
  icons: {
    icon: [
      { url: "/icon.png?v=2", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: {
      default: `${BRAND_NAME} — Shop`,
      template: `%s — ${BRAND_NAME}`,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: {
      default: `${BRAND_NAME} — Shop`,
      template: `%s — ${BRAND_NAME}`,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} ${geistSans.variable} min-h-screen font-sans antialiased`}
      >
        <script
          id="meta-pixel-base"
          dangerouslySetInnerHTML={{ __html: META_PIXEL_BOOTSTRAP_JS }}
        />
        {children}
      </body>
    </html>
  );
}
