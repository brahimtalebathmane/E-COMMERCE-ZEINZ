"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LoadingFallback() {
  const { t, dir } = useLanguage();
  return (
    <div
      className="mx-auto min-w-0 max-w-7xl overflow-x-clip px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10 lg:px-8 lg:pt-14"
      dir={dir}
    >
      <div className="h-8 max-w-xs animate-pulse rounded-lg bg-[var(--accent-muted)]/50" aria-hidden />
      <div className="mt-3 h-4 max-w-md animate-pulse rounded bg-[var(--accent-muted)]/40" aria-hidden />
      <ul
        className="mt-8 grid list-none grid-cols-1 gap-5 p-0 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8"
        role="list"
        aria-busy="true"
        aria-label={t("catalog.title")}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)]">
            <div className="aspect-[4/3] animate-pulse bg-[var(--accent-muted)]/45" />
            <div className="space-y-3 p-4 sm:p-5">
              <div className="h-6 w-full max-w-[14rem] animate-pulse rounded bg-[var(--accent-muted)]/50" />
              <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-[var(--accent-muted)]/35" />
              <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-[var(--accent-muted)]/35" />
              <div className="mt-4 flex flex-col gap-3 border-t border-[var(--accent-muted)]/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="h-7 w-24 animate-pulse rounded bg-[var(--accent-muted)]/50" />
                <div className="h-12 w-full animate-pulse rounded-xl bg-[var(--accent-muted)]/55 sm:w-28" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
