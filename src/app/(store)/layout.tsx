import dynamic from "next/dynamic";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreSiteFooter } from "@/components/store/StoreSiteFooter";
import { StoreLayoutHeader } from "@/components/store/StoreLayoutHeader";
import { StorefrontSerwistCleanup } from "@/components/store/StorefrontSerwistCleanup";

const StoreToaster = dynamic(() =>
  import("@/components/StoreToaster").then((m) => ({
    default: m.StoreToaster,
  })),
);

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <StorefrontSerwistCleanup />
      <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip">
        <StoreLayoutHeader />
        <div className="min-h-0 flex-1">{children}</div>
        <StoreSiteFooter />
        <StoreToaster />
      </div>
    </LanguageProvider>
  );
}
