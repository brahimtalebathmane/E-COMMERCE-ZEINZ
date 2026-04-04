"use client";

import { Toaster } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

export function StoreToaster() {
  const { dir } = useLanguage();
  return <Toaster richColors position="top-center" dir={dir} />;
}
