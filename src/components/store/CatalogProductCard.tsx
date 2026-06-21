"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPrice } from "@/lib/currency";
import type { Locale } from "@/lib/i18n";
import {
  parseTestimonialList,
  ratingSummaryFromTestimonials,
} from "@/lib/catalog-rating";
import { CatalogProductMedia } from "@/components/store/CatalogProductMedia";

export type CatalogProduct = {
  name_ar: string;
  name_fr: string;
  hero_subtitle_ar: string;
  hero_subtitle_fr: string;
  slug: string;
  discount_price: number | null;
  price: number;
  media_type: "image" | "video";
  media_url: string;
  testimonials_ar: unknown;
  testimonials_fr: unknown;
};

function displayName(p: CatalogProduct, locale: Locale): string {
  if (locale === "fr" && p.name_fr.trim()) return p.name_fr.trim();
  return p.name_ar.trim() || p.name_fr.trim() || p.slug;
}

function secondaryName(p: CatalogProduct, locale: Locale): string | null {
  if (locale === "fr") {
    const s = p.name_ar.trim();
    if (s && s !== p.name_fr.trim()) return s;
    return null;
  }
  const s = p.name_fr.trim();
  if (s && s !== p.name_ar.trim()) return s;
  return null;
}

function heroSubtitle(p: CatalogProduct, locale: Locale): string | null {
  const line =
    locale === "fr"
      ? p.hero_subtitle_fr.trim() || p.hero_subtitle_ar.trim()
      : p.hero_subtitle_ar.trim() || p.hero_subtitle_fr.trim();
  return line || null;
}

function StarRating({
  average,
  countLabel,
}: {
  average: number;
  countLabel: string;
}) {
  const pct = Math.max(0, Math.min(1, average / 5)) * 100;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="relative inline-flex select-none text-base leading-none text-amber-500"
        aria-hidden
      >
        <span className="text-[var(--accent-muted)]">★★★★★</span>
        <span
          className="absolute start-0 top-0 overflow-hidden whitespace-nowrap text-amber-500"
          style={{ width: `${pct}%` }}
        >
          ★★★★★
        </span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]" dir="ltr">
        {average.toFixed(1)}
      </span>
      <span className="text-xs text-[var(--muted)]">{countLabel}</span>
    </div>
  );
}

type Props = {
  product: CatalogProduct;
  index: number;
};

export function CatalogProductCard({ product, index }: Props) {
  const { t, dir, locale } = useLanguage();
  const primary = displayName(product, locale);
  const secondary = secondaryName(product, locale);
  const subtitle = heroSubtitle(product, locale);
  const list =
    locale === "fr"
      ? parseTestimonialList(product.testimonials_fr)
      : parseTestimonialList(product.testimonials_ar);
  const rating = ratingSummaryFromTestimonials(list);
  const hasDiscount =
    product.discount_price != null &&
    Number(product.discount_price) < Number(product.price);
  const priceValue = hasDiscount
    ? Number(product.discount_price)
    : Number(product.price);
  const discountPct =
    hasDiscount && Number(product.price) > 0
      ? Math.round(
          ((Number(product.price) - Number(product.discount_price)) /
            Number(product.price)) *
            100,
        )
      : 0;

  return (
    <li className="min-w-0 list-none">
      <article
        className="store-card group flex h-full flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--accent)]/40 hover:[box-shadow:var(--shadow-lg)] motion-reduce:transform-none motion-reduce:transition-none"
        dir={dir}
      >
        <Link
          href={`/${product.slug}`}
          aria-label={primary}
          className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--accent-muted)]/30 outline-none ring-[var(--accent)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
          prefetch
        >
          <CatalogProductMedia
            mediaType={product.media_type}
            mediaUrl={product.media_url}
            alt={primary}
            priority={index < 3}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          {discountPct > 0 ? (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-extrabold text-[var(--accent-foreground)] shadow-md ring-1 ring-black/10">
              {t("catalog.saveBadge", { percent: discountPct })}
            </span>
          ) : null}
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-5">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-bold leading-snug tracking-tight text-[var(--foreground)] sm:text-xl">
              <Link
                href={`/${product.slug}`}
                className="rounded-sm outline-none ring-[var(--accent)] transition-colors hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
                prefetch
              >
                {primary}
              </Link>
            </h2>
            {secondary ? (
              <p className="text-sm font-medium text-[var(--muted)]">{secondary}</p>
            ) : null}
            {subtitle ? (
              <p className="line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="mt-1 min-h-[1.5rem]">
            {rating ? (
              <StarRating
                average={rating.average}
                countLabel={t("catalog.reviewsCount", { count: rating.count })}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">{t("catalog.noReviewsYet")}</p>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-baseline gap-2" dir="ltr">
              <p className="text-xl font-extrabold tabular-nums tracking-tight text-[var(--foreground)]">
                {formatPrice(priceValue)}
              </p>
              {hasDiscount ? (
                <p className="text-sm font-semibold tabular-nums text-[var(--muted)] line-through decoration-[1.5px]">
                  {formatPrice(Number(product.price))}
                </p>
              ) : null}
            </div>
            <Link
              href={`/${product.slug}`}
              prefetch
              className="store-btn-primary min-h-[46px] w-full sm:w-auto sm:min-w-[8rem]"
            >
              {t("catalog.viewProduct")}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}
