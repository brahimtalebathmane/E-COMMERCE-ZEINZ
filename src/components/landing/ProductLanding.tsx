"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { ORDER_STORAGE_KEY } from "@/lib/constants";
import { BuyModal } from "./BuyModal";
import { PostPaymentForm } from "./PostPaymentForm";
import { MetaPixel } from "@/components/MetaPixel";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  product: ProductRow;
};

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

  function isVideo(url: string) {
    return product.media_type === "video" || /\.m3u8($|\?)/i.test(url);
  }

  return (
    <div
      className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:px-8"
      dir={dir}
    >
      <MetaPixel pixelId={product.meta_pixel_id} />

      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {product.name}
        </h1>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-lg">
          {price.discounted != null ? (
            <>
              <span className="text-[var(--muted)] line-through">
                ${price.original.toFixed(2)}
              </span>
              <span className="text-2xl font-semibold text-[var(--accent)]">
                ${price.discounted.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-2xl font-semibold">${price.original.toFixed(2)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-8 inline-flex min-w-[200px] items-center justify-center rounded-2xl bg-[var(--accent)] px-8 py-4 text-base font-semibold text-white shadow-lg transition hover:opacity-90"
        >
          {t("product.buyNow")}
        </button>
      </header>

      <section className="mt-14">
        <div className="overflow-hidden rounded-3xl border border-[var(--accent-muted)] bg-[var(--card)] shadow-sm">
          {isVideo(product.media_url) ? (
            <video
              className="aspect-video w-full bg-black object-cover"
              src={product.media_url}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="relative aspect-video w-full bg-[var(--accent-muted)]">
              <Image
                src={product.media_url}
                alt={product.name}
                fill
                className="object-cover"
                sizes="100vw"
                priority
              />
            </div>
          )}
        </div>
      </section>

      {product.features?.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t("product.features")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {product.features.map((f) => (
              <li
                key={f}
                className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-3 text-start text-sm"
              >
                {f}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {product.description?.trim() ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t("product.description")}</h2>
          <p className="mt-4 whitespace-pre-wrap text-start text-[var(--muted)]">
            {product.description}
          </p>
        </section>
      ) : null}

      {product.gallery?.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t("product.gallery")}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {product.gallery.map((url) => (
              <div
                key={url}
                className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--accent-muted)]"
              >
                <Image src={url} alt="" fill className="object-cover" sizes="33vw" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {product.testimonials?.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t("product.testimonials")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {product.testimonials.map((tItem, i) => (
              <figure
                key={`${tItem.name}-${i}`}
                className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6"
              >
                <blockquote className="text-start text-sm leading-relaxed text-[var(--foreground)]">
                  &ldquo;{tItem.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-start text-xs font-medium text-[var(--muted)]">
                  {tItem.name}
                  {tItem.role ? ` · ${tItem.role}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {product.faqs?.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{t("product.faq")}</h2>
          <div className="mt-6 space-y-3">
            {product.faqs.map((faq, i) => (
              <details
                key={`${faq.q}-${i}`}
                className="group rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] px-5 py-4"
              >
                <summary className="cursor-pointer text-start text-sm font-medium">
                  {faq.q}
                </summary>
                <p className="mt-3 text-start text-sm text-[var(--muted)]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-16">
        {resume ? (
          <PostPaymentForm
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
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--accent-muted)] p-8 text-center text-sm text-[var(--muted)]">
            {t("product.afterPaymentHint")}
          </div>
        )}
      </section>

      <BuyModal product={product} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
