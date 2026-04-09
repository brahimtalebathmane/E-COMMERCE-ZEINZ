"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LoadingFallback() {
  const { t, dir } = useLanguage();
  return (
    <div
      className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center text-sm text-[var(--muted)] sm:py-16"
      dir={dir}
    >
      {t("catalog.title")}
    </div>
  );
}
