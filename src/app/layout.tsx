import type { Metadata, Viewport } from "next";
import { Geist, Tajawal } from "next/font/google";
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

export const metadata: Metadata = {
  title: "ZEINZ — Product",
  description: "Single-product landing and checkout",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        {children}
      </body>
    </html>
  );
}
