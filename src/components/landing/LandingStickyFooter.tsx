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
  const discountPct =
    hasDiscount && price > 0 ? Math.round((savingsAmount / price) * 100) : 0;

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
  const priceLabel = locale === "fr" ? "Prix promo" : "السعر بعد الخصم";
  const originalLabel = locale === "fr" ? "Au lieu de" : "بدلاً من";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 pb-[max(env(safe-area-inset-bottom),10px)] pt-0 shadow-[0_-18px_56px_rgba(0,0,0,0.32)] backdrop-blur-md"
      style={{
        backgroundColor: barBg,
        backgroundImage:
          "linear-gradient(to top, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 55%), radial-gradient(120% 220% at 50% 100%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%)",
      }}
    >
      {/* Top accent gradient line */}
      <div
        className="h-[2px] w-full"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 18%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.35) 82%, transparent 100%)",
        }}
        aria-hidden
      />

      {/* Countdown row (full-width centered pill, only when enabled) */}
      {showTimer ? (
        <div
          className="mx-auto flex w-full max-w-4xl items-center justify-center px-4 pt-2.5 sm:px-6 sm:pt-3"
          dir="ltr"
        >
          <div
            className="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 ring-1 ring-white/12 backdrop-blur-sm sm:gap-3 sm:px-4 sm:py-1.5"
            role="timer"
            aria-live="polite"
            aria-label={timerLabel}
          >
            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-full w-full rounded-full bg-red-500" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/85 sm:text-[11px]">
              {timerLabel}
            </p>
            <span className="h-3 w-px bg-white/20 sm:h-3.5" aria-hidden />
            <div className="flex items-center gap-1 sm:gap-1.5">
              <TimerCell value={pad2(h)} unit={units.h} bg={timerBoxBg} fg={timerDigit} />
              <TimerSep />
              <TimerCell value={pad2(m)} unit={units.m} bg={timerBoxBg} fg={timerDigit} />
              <TimerSep />
              <TimerCell value={pad2(s)} unit={units.s} bg={timerBoxBg} fg={timerDigit} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main row: pricing + CTA */}
      <div className="mx-auto max-w-4xl px-4 pt-3 sm:px-6 sm:pt-3.5">
        <div
          className="grid items-center gap-x-3 gap-y-2 sm:gap-x-6"
          style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
          dir="ltr"
        >
          {/* Pricing block */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65 sm:text-[11px]">
                {priceLabel}
              </p>
              {hasDiscount && discountPct > 0 ? (
                <span
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm ring-1 ring-black/15 sm:text-[11px]"
                  style={{ backgroundColor: badgeBg }}
                >
                  -{discountPct}%
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex items-baseline gap-2 sm:gap-3">
              <span
                className="text-[1.7rem] font-black leading-none tabular-nums tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] sm:text-[2.1rem] md:text-[2.25rem]"
                dir="ltr"
              >
                {formatPrice(currentPrice)}
              </span>
              {hasDiscount ? (
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/55 sm:text-[10px]">
                    {originalLabel}
                  </span>
                  <span
                    className="text-[13px] font-semibold tabular-nums text-white/70 line-through decoration-white/55 decoration-[1.5px] sm:text-sm"
                    dir="ltr"
                  >
                    {formatPrice(price)}
                  </span>
                </span>
              ) : null}
            </div>

            {hasDiscount && badgeText ? (
              <div className="mt-1.5">
                <span
                  className="inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[10px] font-bold leading-none text-white shadow-sm ring-1 ring-black/15 sm:text-[11px]"
                  style={{ backgroundColor: badgeBg }}
                >
                  {badgeText}
                </span>
              </div>
            ) : null}
          </div>

          {/* CTA */}
          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={onCheckout}
              className="group relative inline-flex min-h-[54px] w-full min-w-0 max-w-[12rem] items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3 text-xs font-extrabold leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.3)] ring-1 ring-black/15 transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.97] active:brightness-95 sm:min-h-[60px] sm:max-w-[15rem] sm:gap-2.5 sm:px-6 sm:py-3.5 sm:text-[15px] md:text-base"
              style={{ backgroundColor: ctaBg, color: ctaFg }}
            >
              {/* Shine sweep on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              />
              <svg
                viewBox="0 0 24 24"
                className="relative h-5 w-5 shrink-0 opacity-90 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <span className="relative line-clamp-2 flex-1 text-center">{ctaLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimerCell({
  value,
  unit,
  bg,
  fg,
}: {
  value: string;
  unit: string;
  bg: string;
  fg: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="inline-flex min-w-[1.85rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[13px] font-extrabold tabular-nums shadow-inner sm:min-w-[2.1rem] sm:px-1.5 sm:py-1 sm:text-sm"
        style={{ backgroundColor: bg, color: fg }}
      >
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-white/70 sm:text-[10px]">
        {unit}
      </span>
    </div>
  );
}

function TimerSep() {
  return (
    <span className="text-xs font-bold leading-none text-white/40 sm:text-sm" aria-hidden>
      :
    </span>
  );
}
