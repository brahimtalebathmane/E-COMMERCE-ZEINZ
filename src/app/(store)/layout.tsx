import dynamic from "next/dynamic";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreLayoutHeader } from "@/components/store/StoreLayoutHeader";

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
      <div className="min-h-screen min-w-0 overflow-x-clip">
        <StoreLayoutHeader />
        {children}
        <StoreToaster />
      </div>
    </LanguageProvider>
  );
}
