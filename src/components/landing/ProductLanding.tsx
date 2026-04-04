"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { ORDER_STORAGE_KEY } from "@/lib/constants";
import { LandingMedia } from "./LandingMedia";
import { useLanguage } from "@/contexts/LanguageContext";

const BuyModal = dynamic(
  () => import("./BuyModal").then((m) => ({ default: m.BuyModal })),
  { ssr: false },
);

const PostPaymentForm = dynamic(
  () => import("./PostPaymentForm").then((m) => ({ default: m.PostPaymentForm })),
  { ssr: false },
);

const MetaPixel = dynamic(
  () =>
    import("@/components/MetaPixel").then((m) => ({ default: m.MetaPixel })),
  { ssr: false },
);
import { formatPrice } from "@/lib/currency";
import Image from "next/image";

type Props = {
  product: ProductRow;
};

const primaryCtaClass =
  "store-btn-primary rounded-2xl px-6 py-3.5 shadow-lg shadow-[var(--accent)]/25";

export function ProductLanding({ product }: Props) {
  const { t, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const [resume, setResume] = useState<{
    orderId: string;
    completionToken: string;
  } | null>(null);

  const price = useMemo(() => {
    const original = product.price;
    const discounted =
      product.discount_price != null ? product.discount_price : null;
    return { original, discounted };
  }, [product]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        orderId?: string;
        completionToken?: string;
        productSlug?: string;
      };
      if (
        parsed.orderId &&
        parsed.completionToken &&
        parsed.productSlug === product.slug
      ) {
        void (async () => {
          const res = await fetch(
            `/api/orders/${parsed.orderId}?token=${encodeURIComponent(parsed.completionToken ?? "")}`,
          );
          if (!res.ok) {
            localStorage.removeItem(ORDER_STORAGE_KEY);
            return;
          }
          const json = (await res.json()) as {
            order?: { form_data?: Record<string, unknown> };
          };
          const fd = json.order?.form_data ?? {};
          if (fd["_purchase_confirmed_at"]) {
            localStorage.removeItem(ORDER_STORAGE_KEY);
            return;
          }
          setResume({
            orderId: parsed.orderId!,
            completionToken: parsed.completionToken!,
          });
        })();
      }
    } catch {
      // ignore
    }
  }, [product.slug]);

  return (
    <div
      className="mx-auto min-w-0 max-w-5xl overflow-x-clip px-4 pb-32 pt-4 sm:px-6 sm:pb-36 sm:pt-6 lg:px-8"
      dir={dir}
    >
      <MetaPixel pixelId={product.meta_pixel_id} />

      <header className="px-0 text-center sm:px-0">
        <h1 className="text-balance break-words text-[clamp(1.375rem,5vw,3rem)] font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          {product.name}
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
        <div className="mt-4 flex justify-center px-1 sm:mt-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${primaryCtaClass} max-w-md sm:max-w-lg`}
          >
            {t("product.buyNow")}
          </button>
        </div>
      </section>

      {product.features?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.features")}
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
            {product.features.map((f) => (
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

      {product.description?.trim() ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.description")}
          </h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-start text-sm leading-relaxed text-[var(--muted)] sm:mt-4 sm:text-base">
            {product.description}
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

      {product.testimonials?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.testimonials")}
          </h2>
          <div className="mt-4 grid gap-3 sm:mt-6 md:grid-cols-2 md:gap-4">
            {product.testimonials.map((tItem, i) => (
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

      {product.faqs?.length ? (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-balance text-xl font-semibold sm:text-2xl">
            {t("product.faq")}
          </h2>
          <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
            {product.faqs.map((faq, i) => (
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

      {resume ? (
        <div
          className="fixed inset-0 z-[45] flex items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("completeOrder.pageTitle")}
        >
          <div className="max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 shadow-xl sm:rounded-2xl sm:p-6">
            <PostPaymentForm
              embedded
              product={product}
              orderId={resume.orderId}
              completionToken={resume.completionToken}
              onDone={() => {
                try {
                  localStorage.removeItem(ORDER_STORAGE_KEY);
                } catch {
                  // ignore
                }
                setResume(null);
              }}
            />
          </div>
        </div>
      ) : null}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--accent-muted)] bg-[var(--card)]/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
        style={{ paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}
      >
        <div className="mx-auto max-w-5xl px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={primaryCtaClass}
          >
            {t("product.buyNow")}
          </button>
        </div>
      </div>

      <BuyModal product={product} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
