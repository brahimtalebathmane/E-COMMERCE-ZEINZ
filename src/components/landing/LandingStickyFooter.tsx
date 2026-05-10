"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { formatPrice } from "@/lib/currency";

type Props = {
  product: ProductRow;
  ctaLabel: string;
  locale: "ar" | "fr";
  onCheckout: () => void;
};

const DEFAULT_BAR = "#14532d";
const DEFAULT_BADGE = "#22c55e";
const DEFAULT_TIMER_BOX = "#ffffff";
const DEFAULT_TIMER_DIGIT = "#15803d";
const DEFAULT_CTA_BG = "#ffffff";
const DEFAULT_CTA_FG = "#14532d";

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function parseEndMs(iso: string | null): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function LandingStickyFooter({ product, ctaLabel, locale, onCheckout }: Props) {
  const endsMs = useMemo(() => parseEndMs(product.sticky_footer_offer_ends_at), [product.sticky_footer_offer_ends_at]);
  const showTimer = product.sticky_footer_show_timer && endsMs != null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showTimer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showTimer]);

  const remainingMs = endsMs != null ? Math.max(0, endsMs - now) : 0;
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const price = product.price;
  const discounted = product.discount_price;
  const currentPrice = discounted != null ? discounted : price;
  const hasDiscount = discounted != null && discounted < price;
  const savingsAmount = hasDiscount ? price - discounted : 0;

  const savingsLine =
    locale === "fr"
      ? product.sticky_footer_savings_badge_fr.trim()
      : product.sticky_footer_savings_badge_ar.trim();
  const derivedSavingsFr =
    savingsAmount > 0 ? `Économisez ${formatPrice(savingsAmount)}` : "";
  const derivedSavingsAr =
    savingsAmount > 0 ? `${formatPrice(savingsAmount).replace(/\s/g, "")} وفّر` : "";

  const badgeText =
    savingsLine ||
    (locale === "fr" ? derivedSavingsFr : derivedSavingsAr) ||
    "";

  const timerLabel =
    (locale === "fr"
      ? product.sticky_footer_timer_label_fr.trim()
      : product.sticky_footer_timer_label_ar.trim()) ||
    (locale === "fr" ? "L'offre se termine dans" : "العرض ينتهي خلال");

  const barBg = product.sticky_footer_bar_bg_color.trim() || DEFAULT_BAR;
  const badgeBg = product.sticky_footer_badge_bg_color.trim() || DEFAULT_BADGE;
  const timerBoxBg = product.sticky_footer_timer_box_bg_color.trim() || DEFAULT_TIMER_BOX;
  const timerDigit = product.sticky_footer_timer_digit_color.trim() || DEFAULT_TIMER_DIGIT;
  const ctaBg = product.sticky_footer_cta_bg_color.trim() || DEFAULT_CTA_BG;
  const ctaFg = product.sticky_footer_cta_text_color.trim() || DEFAULT_CTA_FG;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3.5 shadow-[0_-14px_36px_rgba(0,0,0,0.22)] sm:px-6 sm:pb-[max(env(safe-area-inset-bottom),16px)] sm:pt-4"
      style={{ backgroundColor: barBg }}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3 sm:gap-5" dir="ltr">
        {/* Pricing */}
        <div className="min-w-0 flex-1">
          <p
            className="text-lg font-bold tabular-nums leading-none text-white sm:text-xl md:text-2xl"
            dir="ltr"
          >
            {formatPrice(currentPrice)}
          </p>
          {hasDiscount ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {badgeText ? (
                <span
                  className="inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-bold text-white sm:text-xs"
                  style={{ backgroundColor: badgeBg }}
                >
                  {badgeText}
                </span>
              ) : null}
              <span className="text-xs font-medium tabular-nums text-white/85 line-through sm:text-sm" dir="ltr">
                {formatPrice(price)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Countdown */}
        {showTimer ? (
          <div className="flex shrink-0 flex-col items-center gap-1 px-0.5">
            <div className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums sm:gap-1.5 sm:text-base md:text-lg">
              <span
                className="min-w-[1.55rem] rounded-md px-1.5 py-1 text-center sm:min-w-[1.85rem] sm:px-2 sm:py-1.5"
                style={{ backgroundColor: timerBoxBg, color: timerDigit }}
              >
                {pad2(h)}
              </span>
              <span className="text-white/90">:</span>
              <span
                className="min-w-[1.55rem] rounded-md px-1.5 py-1 text-center sm:min-w-[1.85rem] sm:px-2 sm:py-1.5"
                style={{ backgroundColor: timerBoxBg, color: timerDigit }}
              >
                {pad2(m)}
              </span>
              <span className="text-white/90">:</span>
              <span
                className="min-w-[1.55rem] rounded-md px-1.5 py-1 text-center sm:min-w-[1.85rem] sm:px-2 sm:py-1.5"
                style={{ backgroundColor: timerBoxBg, color: timerDigit }}
              >
                {pad2(s)}
              </span>
            </div>
            <p className="max-w-[7rem] text-center text-[10px] font-medium leading-tight text-white/90 sm:max-w-none sm:text-[11px]">
              {timerLabel}
            </p>
          </div>
        ) : null}

        {/* CTA */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onCheckout}
            className="inline-flex min-h-[48px] max-w-[11rem] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold leading-tight shadow-lg transition hover:brightness-105 active:brightness-95 sm:min-h-[52px] sm:max-w-none sm:gap-2.5 sm:rounded-[1.35rem] sm:px-6 sm:py-3.5 sm:text-sm md:text-base"
            style={{ backgroundColor: ctaBg, color: ctaFg }}
          >
            <span className="line-clamp-2 text-end">{ctaLabel}</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
