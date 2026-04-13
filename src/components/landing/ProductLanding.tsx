"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import { LandingMedia } from "./LandingMedia";
import { useLanguage } from "@/contexts/LanguageContext";
import { OrderFormModal } from "@/components/landing/OrderFormModal";

import dynamic from "next/dynamic";
const MetaPixel = dynamic(
  () => import("@/components/MetaPixel").then((m) => ({ default: m.MetaPixel })),
  { ssr: false },
);
import { trackInitiateCheckout } from "@/components/MetaPixel";
import { formatPrice } from "@/lib/currency";
import Image from "next/image";
import { ensureMetaFunnelSession, touchMetaFunnelActivity } from "@/lib/meta-client";

type Props = {
  product: ProductRow;
};

const primaryCtaClass =
  "store-btn-primary rounded-2xl px-6 py-3.5 shadow-lg shadow-[var(--accent)]/25";

export function ProductLanding({ product }: Props) {
  const { t, dir, locale, setLocale } = useLanguage();
  const copy = useMemo(
    () => getLocalizedProductCopy(locale, product),
    [locale, product],
  );
  const [open, setOpen] = useState(false);
  const price = useMemo(() => {
    const original = product.price;
    const discounted =
      product.discount_price != null ? product.discount_price : null;
    return { original, discounted };
  }, [product]);

  useEffect(() => {
    // Landing pages must always start from the admin-selected default language.
    // Users can still manually switch using the global language switcher.
    setLocale(product.default_language ?? "ar");
  }, [product.default_language, setLocale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      ensureMetaFunnelSession();
    } catch {
      // ignore storage errors
    }
  }, []);

  return (
    <div
      className="mx-auto min-w-0 max-w-5xl overflow-x-clip px-4 pb-32 pt-4 sm:px-6 sm:pb-36 sm:pt-6 lg:px-8"
      dir={dir}
    >
      <MetaPixel pixelId={product.meta_pixel_id} />

      <header className="px-0 text-center sm:px-0">
        <h1 className="text-balance break-words text-[clamp(1.375rem,5vw,3rem)] font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          {copy.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-base sm:mt-4 sm:gap-3 sm:text-lg">
          {price.discounted != null ? (
            <>
              <span className="text-[var(--muted)] line-through">
                {formatPrice(price.original)}
              </span>
              <span className="text-xl font-semibold text-[var(--accent)] sm:text-2xl">
                {formatPrice(price.discounted)}
              </span>
            </>
          ) : (
            <span className="text-xl font-semibold sm:text-2xl">
              {formatPrice(price.original)}
            </span>
          )}
        </div>
      </header>

      <section className="mt-8 min-w-0 sm:mt-10">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] shadow-sm sm:rounded-3xl">
          <LandingMedia product={product} priority />
        </div>
      </section>

      {copy.features?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.features")}
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
            {copy.features.map((f) => (
              <li
                key={f}
                className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-3 py-3 text-start text-sm leading-relaxed sm:px-4"
              >
                {f}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {copy.description?.trim() ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.description")}
          </h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-start text-sm leading-relaxed text-[var(--muted)] sm:mt-4 sm:text-base">
            {copy.description}
          </p>
        </section>
      ) : null}

      {product.gallery?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.gallery")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:mt-6 sm:grid-cols-3 sm:gap-4">
            {product.gallery.map((url) => (
              <div
                key={url}
                className="relative aspect-square min-w-0 overflow-hidden rounded-xl border border-[var(--accent-muted)] sm:rounded-2xl"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 639px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  quality={80}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {copy.testimonials?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.testimonials")}
          </h2>
          <div className="mt-4 grid gap-3 sm:mt-6 md:grid-cols-2 md:gap-4">
            {copy.testimonials.map((tItem, i) => (
              <figure
                key={`${tItem.name}-${i}`}
                className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 sm:rounded-2xl sm:p-6"
              >
                <blockquote className="break-words text-start text-sm leading-relaxed text-[var(--foreground)]">
                  &ldquo;{tItem.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-start text-xs font-medium text-[var(--muted)]">
                  {tItem.name}
                  {tItem.role ? ` · ${tItem.role}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {copy.faqs?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.faq")}
          </h2>
          <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
            {copy.faqs.map((faq, i) => (
              <details
                key={`${faq.q}-${i}`}
                className="group rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-3 sm:rounded-2xl sm:px-5 sm:py-4"
              >
                <summary className="cursor-pointer break-words text-start text-sm font-medium leading-snug">
                  {faq.q}
                </summary>
                <p className="mt-2 break-words text-start text-sm leading-relaxed text-[var(--muted)] sm:mt-3">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--accent-muted)] bg-[var(--card)]/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)] sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:shadow-none sm:backdrop-blur-0"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-0">
          <button
            type="button"
            onClick={() => {
              try {
                touchMetaFunnelActivity();
                trackInitiateCheckout(ensureMetaFunnelSession());
              } catch {
                // ignore
              }
              setOpen(true);
            }}
            className={`${primaryCtaClass} w-full max-w-md sm:max-w-lg`}
          >
            {t("product.buyNow")}
          </button>
        </div>
      </div>

      <OrderFormModal
        product={product}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
