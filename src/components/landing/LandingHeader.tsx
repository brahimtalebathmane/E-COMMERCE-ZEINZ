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
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--accent-muted)]/70 bg-[var(--background)]/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[390px] px-3 py-2 md:max-w-[460px]">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" aria-label="Go to home page" className="min-w-0 shrink">
            <SiteLogo priority className="h-8 sm:h-9" alt="E-Commerce Zeina" />
          </Link>
          <LanguageSwitcher storageKey="landing-locale" />
        </div>
        <div className="mt-2 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-3 py-2 text-center leading-tight">
          <p className="truncate text-[11px] font-semibold text-[var(--foreground)] sm:text-xs">{offerText}</p>
          <p className="truncate text-[10px] font-bold text-[var(--accent)] sm:text-[11px]">{discountText}</p>
          <p className="truncate text-[10px] font-semibold text-[var(--muted)] sm:text-[11px]">{promoText}</p>
          <p className="truncate text-[10px] font-bold text-[var(--accent)] sm:text-[11px]">{announcementText}</p>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={onCtaClick}
            className="store-btn-primary min-h-[42px] rounded-lg px-4 py-2 text-[11px] font-extrabold leading-none shadow-[0_8px_18px_rgba(0,107,12,0.22)] transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] sm:text-xs"
          >
            {ctaText}
          </button>
        </div>
      </div>
    </header>
  );
}
