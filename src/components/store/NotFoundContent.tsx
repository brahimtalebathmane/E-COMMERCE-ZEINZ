"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export function NotFoundContent() {
  const { t, dir } = useLanguage();
  return (
    <div
      className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center"
      dir={dir}
    >
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("notFound.body")}</p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-[var(--accent)] underline"
      >
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
