"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Landing-only header logo (hosted asset). */
const LANDING_HEADER_LOGO_URL = "https://i.postimg.cc/3JgfjBz4/ughujgijk.png";

type Props = {
  offerText: string;
  discountText: string;
  promoText: string;
  announcementText: string;
};

export function LandingHeader({
  offerText,
  discountText,
  promoText,
  announcementText,
}: Props) {
  const hasPromoStrip = Boolean(
    offerText.trim() || discountText.trim() || promoText.trim() || announcementText.trim(),
  );

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
              src={LANDING_HEADER_LOGO_URL}
              alt=""
              fill
              className="object-contain object-right"
              sizes="(max-width: 640px) 52vw, 200px"
              priority
            />
          </Link>
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
