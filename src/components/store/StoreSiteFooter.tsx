"use client";

import Link from "next/link";
import { SiteLogo } from "@/components/SiteLogo";
import type { CSSProperties } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { BRAND_COLOR } from "@/lib/site-branding";

const PHONE_DISPLAY = "+222 33713957";
const PHONE_TEL = "+22233713957";
const WHATSAPP_HREF = "https://wa.me/22233713957";
const EMAIL = "support@zeinaa.net";

export function StoreSiteFooter() {
  const { t } = useLanguage();

  return (
    <footer
      className="mt-auto border-t border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]"
      style={
        {
          "--accent": BRAND_COLOR,
          "--accent-muted": `color-mix(in srgb, ${BRAND_COLOR} 34%, white)`,
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="h-0.5 w-full"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 60%, transparent), transparent)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          <div className="space-y-3">
            <Link href="/" className="inline-flex">
              <SiteLogo />
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t("siteFooter.brand")}
            </p>
            <p className="text-sm leading-relaxed text-[var(--muted)]">{t("siteFooter.tagline")}</p>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t("siteFooter.contactHeading")}
            </p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="shrink-0 font-medium text-[var(--foreground)]">{t("siteFooter.phone")}</span>
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="font-mono text-[var(--accent)] underline decoration-[var(--accent-muted)] underline-offset-2 transition hover:opacity-90"
                  dir="ltr"
                >
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="shrink-0 font-medium text-[var(--foreground)]">{t("siteFooter.whatsapp")}</span>
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--accent)] underline decoration-[var(--accent-muted)] underline-offset-2 transition hover:opacity-90"
                  dir="ltr"
                >
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="shrink-0 font-medium text-[var(--foreground)]">{t("siteFooter.email")}</span>
                <a
                  href={`mailto:${EMAIL}`}
                  className="break-all text-[var(--accent)] underline decoration-[var(--accent-muted)] underline-offset-2 transition hover:opacity-90"
                  dir="ltr"
                >
                  {EMAIL}
                </a>
              </li>
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-4 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-[var(--muted)]">{t("siteFooter.hoursHint")}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--accent-muted)]/50 pt-4 text-xs text-[var(--muted)] lg:border-t-0 lg:pt-0">
              <Link href="/" className="text-[var(--accent)] underline-offset-2 hover:underline">
                {t("notFound.backHome")}
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-[var(--accent-muted)]/50 pt-6 text-center text-xs text-[var(--muted)]">
          {t("siteFooter.copyright", { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}
