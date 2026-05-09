"use client";

import Image from "next/image";

type Props = {
  logoUrl: string;
  offerText: string;
  discountText: string;
  promoText: string;
  announcementText: string;
  ctaText: string;
  onCtaClick: () => void;
};

export function LandingHeader({
  logoUrl,
  offerText,
  discountText,
  promoText,
  announcementText,
  ctaText,
  onCtaClick,
}: Props) {
  return (
    <header className="bg-white px-3 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex w-full max-w-[390px] items-center gap-2 md:max-w-[460px]">
        <div className="flex min-w-[74px] shrink-0 items-center justify-start sm:min-w-[88px]">
          <Image src={logoUrl} alt="Brand logo" width={92} height={34} className="h-8 w-auto object-contain" />
        </div>

        <div className="min-w-0 flex-1 text-center leading-tight text-[#1f1a16]">
          <p className="truncate text-[11px] font-semibold text-[#2f2a27] sm:text-xs">{offerText}</p>
          <p className="truncate text-[10px] font-bold text-[#046b12] sm:text-[11px]">{discountText}</p>
          <p className="truncate text-[10px] font-semibold text-[#2f2a27] sm:text-[11px]">{promoText}</p>
          <p className="truncate text-[10px] font-bold text-[#046b12] sm:text-[11px]">{announcementText}</p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onCtaClick}
            className="rounded-md bg-[#046b12] px-3 py-2 text-[11px] font-extrabold leading-none text-white shadow-[0_4px_12px_rgba(4,107,18,0.25)] transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] sm:px-4 sm:text-xs"
          >
            {ctaText}
          </button>
        </div>
      </div>
    </header>
  );
}
