"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";
import { SITE_LOGO_URL } from "@/lib/site-branding";

type Props = {
  /** Resolved landing header logo (HTTPS). */
  logoSrc: string;
  /** Optional accent line in the header center column. */
  headerCtaText?: string;
};

export function LandingHeader({ logoSrc, headerCtaText }: Props) {
  const hasCta = Boolean(headerCtaText?.trim());
  const logo = logoSrc.trim() || SITE_LOGO_URL;

  return (
    <header className="border-b border-[var(--accent-muted)]/70 bg-[var(--background)]/95 shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[min(100%,24rem)] px-3 pb-2.5 pt-2 sm:max-w-[min(100%,26rem)] sm:px-5 md:max-w-[min(100%,36rem)] lg:max-w-3xl xl:max-w-4xl md:px-8">
        {/* dir="ltr" keeps language left / logo right regardless of page reading direction */}
        <div
          className="flex w-full min-h-[2.5rem] items-center gap-2 sm:min-h-[2.75rem] sm:gap-3 md:gap-4"
          dir="ltr"
        >
          <div className="shrink-0">
            <LanguageSwitcher storageKey="landing-locale" />
          </div>

          {hasCta ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-1 text-center sm:px-2">
              <p
                dir="auto"
                className="w-full max-w-full text-[10px] font-semibold leading-snug text-[var(--accent)] sm:text-[11px] md:text-xs"
              >
                {(headerCtaText ?? "").trim()}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1" aria-hidden />
          )}

          <Link href="/" className="shrink-0" aria-label="Go to home page">
            <SiteLogo src={logo} alt="" objectAlign="end" priority />
          </Link>
        </div>
      </div>
    </header>
  );
}
