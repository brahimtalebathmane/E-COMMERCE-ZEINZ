"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Fallback when product has no logo URL in admin. */
const DEFAULT_HEADER_LOGO_URL = "https://i.postimg.cc/3JgfjBz4/ughujgijk.png";

type Props = {
  /** Single localized promo line for the thin strip under the logo row. */
  headerBarText: string;
  /** Resolved landing header logo (HTTPS). */
  logoSrc: string;
  /** Optional line under the promo strip (from admin header CTA fields). */
  headerCtaText?: string;
  /** 0 = full wrap; 1–12 = max visible lines with ellipsis. */
  headerBarMaxLines?: number;
  /** Optional font size in px; omit/null keeps responsive theme sizing. */
  headerBarFontSizePx?: number | null;
};

export function LandingHeader({
  headerBarText,
  logoSrc,
  headerCtaText,
  headerBarMaxLines = 0,
  headerBarFontSizePx = null,
}: Props) {
  const hasPromoStrip = Boolean(headerBarText.trim());
  const logo = logoSrc.trim() || DEFAULT_HEADER_LOGO_URL;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--accent-muted)]/70 bg-[var(--background)]/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[min(100%,24rem)] px-4 pb-3 pt-2 sm:max-w-[min(100%,26rem)] sm:px-6 md:max-w-[min(100%,36rem)] lg:max-w-3xl xl:max-w-4xl md:px-8">
        {/* dir="ltr" keeps language left / logo right regardless of page reading direction */}
        <div className="flex w-full items-center justify-between gap-4" dir="ltr">
          <div className="min-w-0 shrink-0">
            <LanguageSwitcher storageKey="landing-locale" />
          </div>

          <Link
            href="/"
            className="relative block h-10 w-[min(52vw,11rem)] shrink-0 sm:h-11 sm:w-[min(44vw,12.5rem)]"
            aria-label="Go to home page"
          >
            <Image
              src={logo}
              alt=""
              fill
              className="object-contain object-right"
              sizes="(max-width: 640px) 52vw, 200px"
              priority
            />
          </Link>
        </div>

        {hasPromoStrip ? (
          <p
            className={`mt-3 border-t border-[var(--accent-muted)]/60 pt-3 text-center font-semibold leading-snug text-[var(--foreground)] ${
              headerBarFontSizePx == null ? "text-xs sm:text-sm" : ""
            }`}
            style={{
              ...(headerBarFontSizePx != null
                ? { fontSize: `${headerBarFontSizePx}px` }
                : {}),
              ...(headerBarMaxLines > 0
                ? {
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: headerBarMaxLines,
                    overflow: "hidden",
                    wordBreak: "break-word",
                    whiteSpace: "pre-line",
                  }
                : { whiteSpace: "pre-line" }),
            }}
          >
            {headerBarText.trim()}
          </p>
        ) : null}

        {headerCtaText?.trim() ? (
          <p className="mt-3 border-t border-[var(--accent-muted)]/60 pt-3 text-center text-[11px] font-semibold leading-snug text-[var(--accent)] sm:text-xs">
            {headerCtaText.trim()}
          </p>
        ) : null}
      </div>
    </header>
  );
}
