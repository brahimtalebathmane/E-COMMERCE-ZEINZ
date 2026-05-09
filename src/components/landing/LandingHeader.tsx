"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";

type Props = {
  offerText: string;
  discountText: string;
  promoText: string;
  announcementText: string;
  ctaText: string;
  onCtaClick: () => void;
};

export function LandingHeader({
  offerText,
  discountText,
  promoText,
  announcementText,
  ctaText,
  onCtaClick,
}: Props) {
  const hasPromoStrip = Boolean(
    offerText.trim() || discountText.trim() || promoText.trim() || announcementText.trim(),
  );

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--accent-muted)]/70 bg-[var(--background)]/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[390px] px-4 pb-3 pt-2 md:max-w-[460px]">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Go to home page" className="min-w-0 shrink-0">
            <SiteLogo priority className="h-10 sm:h-11" alt="E-Commerce Zeina" />
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher storageKey="landing-locale" />
            <button
              type="button"
              onClick={onCtaClick}
              className="store-btn-primary !w-auto max-w-[min(160px,42vw)] shrink-0 rounded-xl px-3 py-2 text-[11px] font-extrabold leading-tight shadow-[0_6px_14px_rgba(0,107,12,0.22)] min-h-[42px] sm:text-xs"
            >
              <span className="line-clamp-2 text-center">{ctaText}</span>
            </button>
          </div>
        </div>

        {hasPromoStrip ? (
          <p className="mt-3 border-t border-[var(--accent-muted)]/60 pt-3 text-center text-[10px] leading-snug text-[var(--foreground)] sm:text-[11px]">
            {offerText.trim() ? <span className="font-semibold">{offerText.trim()}</span> : null}
            {discountText.trim() ? (
              <>
                {offerText.trim() ? <span className="text-[var(--muted)]"> · </span> : null}
                <span className="font-bold text-[var(--accent)]">{discountText.trim()}</span>
              </>
            ) : null}
            {promoText.trim() ? (
              <>
                {offerText.trim() || discountText.trim() ? <span className="text-[var(--muted)]"> · </span> : null}
                <span className="font-semibold text-[var(--muted)]">{promoText.trim()}</span>
              </>
            ) : null}
            {announcementText.trim() ? (
              <>
                {offerText.trim() || discountText.trim() || promoText.trim() ? (
                  <span className="text-[var(--muted)]"> · </span>
                ) : null}
                <span className="font-bold text-[var(--accent)]">{announcementText.trim()}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}
