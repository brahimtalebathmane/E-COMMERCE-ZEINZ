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
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M11 8v3M11 14h.01" />
        </svg>
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t("notFound.body")}</p>
      <Link href="/" className="store-btn-primary mt-7 w-auto px-6">
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
