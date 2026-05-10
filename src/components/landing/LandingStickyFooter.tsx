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

function timerUnitCaptions(locale: "ar" | "fr") {
  if (locale === "fr") {
    return { h: "h", m: "min", s: "s" };
  }
  return { h: "س", m: "د", s: "ث" };
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

  const units = timerUnitCaptions(locale);
  const priceLabel = locale === "fr" ? "Prix" : "السعر";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/15 pb-[max(env(safe-area-inset-bottom),12px)] pt-0 shadow-[0_-12px_48px_rgba(0,0,0,0.28)] backdrop-blur-[2px] sm:pb-[max(env(safe-area-inset-bottom),14px)]"
      style={{
        backgroundColor: barBg,
        backgroundImage:
          "linear-gradient(to top, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 42%), linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)",
      }}
    >
      {/* Top highlight line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />

      <div className="mx-auto max-w-4xl px-4 pt-3.5 sm:px-6 sm:pt-4">
        <div
          className={`grid items-center gap-y-3 ${showTimer ? "grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 sm:gap-x-5" : "grid-cols-[minmax(0,1fr)_auto] gap-x-3 sm:gap-x-6"}`}
          dir="ltr"
        >
          {/* Pricing */}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65 sm:text-[11px]">
              {priceLabel}
            </p>
            <p
              className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl md:text-[1.65rem]"
              dir="ltr"
            >
              {formatPrice(currentPrice)}
            </p>
            {hasDiscount ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {badgeText ? (
                  <span
                    className="inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[10px] font-bold leading-none text-white shadow-sm ring-1 ring-black/10 sm:text-[11px]"
                    style={{ backgroundColor: badgeBg }}
                  >
                    {badgeText}
                  </span>
                ) : null}
                <span
                  className="text-[11px] font-medium tabular-nums text-white/75 line-through decoration-white/50 sm:text-xs"
                  dir="ltr"
                >
                  {formatPrice(price)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Countdown */}
          {showTimer ? (
            <div
              className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/18 px-2 py-2 ring-1 ring-white/12 sm:gap-2 sm:px-3.5 sm:py-2.5"
              role="timer"
              aria-live="polite"
              aria-label={timerLabel}
            >
              <p className="max-w-[9.5rem] text-center text-[9px] font-medium leading-tight text-white/85 sm:max-w-none sm:text-[10px]">
                {timerLabel}
              </p>
              <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="flex min-w-[2rem] items-center justify-center rounded-lg px-1.5 py-1 text-sm font-bold tabular-nums shadow-inner sm:min-w-[2.35rem] sm:px-2 sm:py-1.5 sm:text-base md:text-lg"
                    style={{ backgroundColor: timerBoxBg, color: timerDigit }}
                  >
                    {pad2(h)}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-white/70 sm:text-[9px]">
                    {units.h}
                  </span>
                </div>
                <span className="self-start pt-1 text-sm font-bold leading-none text-white/50 sm:pt-1.5 sm:text-base" aria-hidden>
                  :
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="flex min-w-[2rem] items-center justify-center rounded-lg px-1.5 py-1 text-sm font-bold tabular-nums shadow-inner sm:min-w-[2.35rem] sm:px-2 sm:py-1.5 sm:text-base md:text-lg"
                    style={{ backgroundColor: timerBoxBg, color: timerDigit }}
                  >
                    {pad2(m)}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-white/70 sm:text-[9px]">
                    {units.m}
                  </span>
                </div>
                <span className="self-start pt-1 text-sm font-bold leading-none text-white/50 sm:pt-1.5 sm:text-base" aria-hidden>
                  :
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="flex min-w-[2rem] items-center justify-center rounded-lg px-1.5 py-1 text-sm font-bold tabular-nums shadow-inner sm:min-w-[2.35rem] sm:px-2 sm:py-1.5 sm:text-base md:text-lg"
                    style={{ backgroundColor: timerBoxBg, color: timerDigit }}
                  >
                    {pad2(s)}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-white/70 sm:text-[9px]">
                    {units.s}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* CTA */}
          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={onCheckout}
              className="group inline-flex min-h-[48px] w-full min-w-0 max-w-[11rem] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold leading-snug shadow-[0_4px_14px_rgba(0,0,0,0.22)] ring-1 ring-black/10 transition hover:brightness-110 active:scale-[0.98] active:brightness-95 sm:min-h-[52px] sm:max-w-[14rem] sm:gap-2.5 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm md:text-base"
              style={{ backgroundColor: ctaBg, color: ctaFg }}
            >
              <span className="line-clamp-2 flex-1 text-center">{ctaLabel}</span>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 opacity-90 transition group-hover:translate-x-0.5 sm:h-5 sm:w-5"
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
    </div>
  );
}
