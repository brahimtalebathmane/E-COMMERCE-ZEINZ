import dynamic from "next/dynamic";
import { MetaPixelBaseScript } from "@/components/MetaPixelBaseScript";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreSiteFooter } from "@/components/store/StoreSiteFooter";
import { StoreLayoutHeader } from "@/components/store/StoreLayoutHeader";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";

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
  const siteWidePixelId = resolveServerMetaPixelId(null);

  return (
    <LanguageProvider>
      <MetaPixelBaseScript pixelId={siteWidePixelId} />
      <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip">
        <StoreLayoutHeader />
        <div className="min-h-0 flex-1">{children}</div>
        <StoreSiteFooter />
        <StoreToaster />
      </div>
    </LanguageProvider>
  );
}
