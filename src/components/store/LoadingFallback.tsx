"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LoadingFallback() {
  const { t, dir } = useLanguage();
  return (
    <div
      className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--muted)]"
      dir={dir}
    >
      {t("completeOrder.loading")}
    </div>
  );
}
