import dynamic from "next/dynamic";
import { Geist, Tajawal } from "next/font/google";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreLayoutHeader } from "@/components/store/StoreLayoutHeader";
import { StorefrontSerwistCleanup } from "@/components/store/StorefrontSerwistCleanup";

// Web fonts belong to the storefront only: the admin uses the phone's system
// font (SF Arabic on iPhone) and must not download these files.
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

const StoreToaster = dynamic(() =>
  import("@/components/StoreToaster").then((m) => ({
    default: m.StoreToaster,
  })),
);

/**
 * `<StoreSiteFooter />` is NOT rendered here — it hardcodes Mauritanian
 * support contact info, which is wrong on a COD Partner (affiliate) product's
 * landing/order-success page. A layout can't read route params or the
 * product row, so each page renders its own footer (or not) as the last
 * child of `children`. `flex-col` on the content wrapper below is what makes
 * that placement still stick to the bottom on short pages — see
 * StoreSiteFooter's own `mt-auto`, which needs a flex-column ancestor to
 * push against. Pages that render no footer still fill the viewport because
 * this wrapper keeps `flex-1`.
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <StorefrontSerwistCleanup />
      <div
        className={`${tajawal.variable} ${geistSans.variable} storefront-light flex min-h-screen min-w-0 flex-col overflow-x-clip font-sans`}
      >
        <StoreLayoutHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <StoreToaster />
      </div>
    </LanguageProvider>
  );
}
