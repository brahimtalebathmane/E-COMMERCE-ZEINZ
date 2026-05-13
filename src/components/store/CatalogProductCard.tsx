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
  const priceValue =
    product.discount_price != null
      ? Number(product.discount_price)
      : Number(product.price);

  return (
    <li className="min-w-0 list-none">
      <article
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] shadow-sm transition duration-150 ease-out hover:border-[var(--accent)] hover:shadow-md motion-reduce:transition-none"
        dir={dir}
      >
        <Link
          href={`/${product.slug}`}
          aria-label={primary}
          className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--accent-muted)]/30 outline-none ring-[var(--accent)] transition-opacity hover:opacity-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
          prefetch
        >
          <CatalogProductMedia
            mediaType={product.media_type}
            mediaUrl={product.media_url}
            alt={primary}
            priority={index < 3}
          />
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-5">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold leading-snug tracking-tight text-[var(--foreground)] sm:text-xl">
              <Link
                href={`/${product.slug}`}
                className="rounded-sm outline-none ring-[var(--accent)] hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
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

          <div className="mt-auto flex flex-col gap-3 border-t border-[var(--accent-muted)]/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-bold tabular-nums text-[var(--foreground)]" dir="ltr">
              {formatPrice(priceValue)}
            </p>
            <Link
              href={`/${product.slug}`}
              prefetch
              className="inline-flex min-h-[48px] shrink-0 touch-manipulation items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-center text-sm font-semibold text-[var(--accent-foreground)] shadow-sm transition duration-150 hover:opacity-90 active:opacity-[0.88] sm:min-w-[7.5rem]"
            >
              {t("catalog.viewProduct")}
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}
