import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreToaster } from "@/components/StoreToaster";
import { StoreHeader } from "@/components/store/StoreHeader";

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <div className="min-h-screen">
        <StoreHeader />
        {children}
        <StoreToaster />
      </div>
    </LanguageProvider>
  );
}
