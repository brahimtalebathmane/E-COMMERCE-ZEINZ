"use client";

import type { Locale } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageSwitcher({
  storageKey,
}: {
  /** Optional: persist selection to a custom localStorage key (e.g. per-landing-page). */
  storageKey?: string;
}) {
  const { locale, setLocale, t } = useLanguage();

  function select(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div
      className="inline-flex items-center gap-0 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-1 text-xs font-semibold shadow-sm"
      role="group"
      aria-label={t("lang.ar") + " / " + t("lang.fr")}
    >
      <button
        type="button"
        onClick={() => select("ar")}
        className={`rounded-lg px-3 py-1.5 transition ${
          locale === "ar"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        AR
      </button>
      <button
        type="button"
        onClick={() => select("fr")}
        className={`rounded-lg px-3 py-1.5 transition ${
          locale === "fr"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        FR
      </button>
    </div>
  );
}
