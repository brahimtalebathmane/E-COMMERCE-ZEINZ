"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  type Locale,
  isRtl,
  translate,
} from "@/lib/i18n";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dir: "rtl" | "ltr";
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "ar";
  const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || "ar";
  return lang.toLowerCase().startsWith("fr") ? "fr" : "ar";
}

function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "ar" || raw === "fr") return raw;
  } catch {
    // ignore
  }
  return null;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored ?? detectBrowserLocale());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const dir: "rtl" | "ltr" = isRtl(locale) ? "rtl" : "ltr";

  const value = useMemo(
    () => ({ locale, setLocale, dir, t }),
    [locale, setLocale, dir, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
