import { Geist_Mono } from "next/font/google";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
});

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${geistMono.variable} min-h-0`}>{children}</div>;
}
