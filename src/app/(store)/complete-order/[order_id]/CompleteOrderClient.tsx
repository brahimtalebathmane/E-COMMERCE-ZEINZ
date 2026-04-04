"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProductRow } from "@/types";
import { PostPaymentForm } from "@/components/landing/PostPaymentForm";
import { MetaPixel } from "@/components/MetaPixel";
import { useLanguage } from "@/contexts/LanguageContext";
import { translate } from "@/lib/i18n";
import { translateErrorMessage } from "@/lib/translate-error";

type Props = { orderId: string };

export function CompleteOrderClient({ orderId }: Props) {
  const { t, locale, dir } = useLanguage();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError(translate(locale, "completeOrder.missingToken"));
      return;
    }
    setLoading(true);
    void (async () => {
      const res = await fetch(
        `/api/orders/${orderId}?token=${encodeURIComponent(token)}`,
      );
      const json = (await res.json()) as {
        order?: {
          completion_token: string;
          form_data?: Record<string, unknown>;
          products?: Record<string, unknown> | Record<string, unknown>[];
        };
        error?: string;
      };
      if (!res.ok) {
        const msg = json.error ?? "Could not load order";
        setError(translateErrorMessage(locale, msg));
        setLoading(false);
        return;
      }
      const raw = json.order?.products;
      const pr = Array.isArray(raw) ? raw[0] : raw;
      if (!pr) {
        setError(translate(locale, "completeOrder.productMissing"));
        setLoading(false);
        return;
      }
      const fd = json.order?.form_data ?? {};
      if (fd["_purchase_confirmed_at"]) {
        setDone(true);
        setLoading(false);
        return;
      }

      const mapped: ProductRow = {
        id: String(pr.id),
        name: String(pr.name),
        description: String(pr.description ?? ""),
        slug: String(pr.slug),
        old_slugs: [],
        price: Number(pr.price),
        discount_price:
          pr.discount_price === null || pr.discount_price === undefined
            ? null
            : Number(pr.discount_price),
        media_type: pr.media_type as "image" | "video",
        media_url: String(pr.media_url),
        features: (pr.features as string[]) ?? [],
        gallery: (pr.gallery as string[]) ?? [],
        testimonials: (pr.testimonials as ProductRow["testimonials"]) ?? [],
        faqs: (pr.faqs as ProductRow["faqs"]) ?? [],
        meta_pixel_id: (pr.meta_pixel_id as string | null) ?? null,
        form_title: String(pr.form_title ?? ""),
        form_fields: Array.isArray(pr.form_fields)
          ? (pr.form_fields as ProductRow["form_fields"])
          : [],
        created_at: String(pr.created_at ?? ""),
      };

      setProduct(mapped);
      setLoading(false);
    })();
  }, [orderId, token, locale]);

  if (loading) {
    return (
      <div
        className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--muted)]"
        dir={dir}
      >
        {t("completeOrder.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" dir={dir}>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" dir={dir}>
        <p className="font-medium">{t("completeOrder.alreadyComplete")}</p>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10" dir={dir}>
      <MetaPixel pixelId={product.meta_pixel_id} />
      <h1 className="text-start text-2xl font-semibold">
        {t("completeOrder.pageTitle")}
      </h1>
      <p className="mt-2 text-start text-sm text-[var(--muted)]">{product.name}</p>
      <div className="mt-8">
        <PostPaymentForm
          product={product}
          orderId={orderId}
          completionToken={token}
        />
      </div>
    </div>
  );
}
