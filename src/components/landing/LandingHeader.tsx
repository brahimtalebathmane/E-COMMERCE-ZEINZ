"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Fallback when product has no logo URL in admin. */
const DEFAULT_HEADER_LOGO_URL = "https://i.postimg.cc/3JgfjBz4/ughujgijk.png";

type Props = {
  /** Localized promo line — shown between the language switcher and the logo. */
  headerBarText: string;
  /** Resolved landing header logo (HTTPS). */
  logoSrc: string;
  /** Optional accent line under the promo (same column). */
  headerCtaText?: string;
  /** 0 = full wrap; 1–12 = max visible lines with ellipsis. */
  headerBarMaxLines?: number;
  /** Optional font size in px; omit/null keeps responsive theme sizing. */
  headerBarFontSizePx?: number | null;
};

function promoStyles(
  headerBarFontSizePx: number | null,
  headerBarMaxLines: number,
): CSSProperties {
  return {
    ...(headerBarFontSizePx != null ? { fontSize: `${headerBarFontSizePx}px` } : {}),
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
  };
}

export function LandingHeader({
  headerBarText,
  logoSrc,
  headerCtaText,
  headerBarMaxLines = 0,
  headerBarFontSizePx = null,
}: Props) {
  const hasPromoStrip = Boolean(headerBarText.trim());
  const hasCta = Boolean(headerCtaText?.trim());
  const showCenter = hasPromoStrip || hasCta;
  const logo = logoSrc.trim() || DEFAULT_HEADER_LOGO_URL;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--accent-muted)]/70 bg-[var(--background)]/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[min(100%,24rem)] px-3 pb-2.5 pt-2 sm:max-w-[min(100%,26rem)] sm:px-5 md:max-w-[min(100%,36rem)] lg:max-w-3xl xl:max-w-4xl md:px-8">
        {/* dir="ltr" keeps language left / logo right regardless of page reading direction */}
        <div
          className="flex w-full min-h-[2.5rem] items-center gap-2 sm:min-h-[2.75rem] sm:gap-3 md:gap-4"
          dir="ltr"
        >
          <div className="shrink-0">
            <LanguageSwitcher storageKey="landing-locale" />
          </div>

          {showCenter ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center sm:px-2">
              {hasPromoStrip ? (
                <p
                  dir="auto"
                  className={`w-full max-w-full font-semibold leading-snug text-[var(--foreground)] ${
                    headerBarFontSizePx == null ? "text-[11px] sm:text-xs md:text-sm" : ""
                  }`}
                  style={promoStyles(headerBarFontSizePx, headerBarMaxLines)}
                >
                  {headerBarText.trim()}
                </p>
              ) : null}
              {hasCta ? (
                <p
                  dir="auto"
                  className="w-full max-w-full text-[10px] font-semibold leading-snug text-[var(--accent)] sm:text-[11px] md:text-xs"
                >
                  {(headerCtaText ?? "").trim()}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1" aria-hidden />
          )}

          <Link
            href="/"
            className="relative block h-10 w-[min(42vw,9.5rem)] shrink-0 sm:h-11 sm:w-[min(38vw,11rem)] md:w-[min(36vw,12rem)]"
            aria-label="Go to home page"
          >
            <Image
              src={logo}
              alt=""
              fill
              className="object-contain object-right"
              sizes="(max-width: 640px) 42vw, 180px"
              priority
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
