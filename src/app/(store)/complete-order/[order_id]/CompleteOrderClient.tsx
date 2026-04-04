"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { mapProductRow } from "@/lib/products";
import { getLocalizedProductCopy } from "@/lib/product-locale";
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

      setProduct(mapProductRow(pr as Record<string, unknown>));
      setLoading(false);
    })();
  }, [orderId, token, locale]);

  const copy = useMemo(
    () => (product ? getLocalizedProductCopy(locale, product) : null),
    [locale, product],
  );

  if (loading) {
    return (
      <div
        className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center text-sm text-[var(--muted)] sm:py-16"
        dir={dir}
      >
        {t("completeOrder.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center sm:py-16"
        dir={dir}
      >
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div
        className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center sm:py-16"
        dir={dir}
      >
        <p className="font-medium">{t("completeOrder.alreadyComplete")}</p>
      </div>
    );
  }

  if (!product || !copy) return null;

  return (
    <div
      className="mx-auto min-w-0 max-w-xl overflow-x-clip px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:py-10"
      dir={dir}
    >
      <MetaPixel pixelId={product.meta_pixel_id} />
      <h1 className="text-start text-xl font-semibold sm:text-2xl">
        {t("completeOrder.pageTitle")}
      </h1>
      <p className="mt-2 text-start text-sm text-[var(--muted)]">{copy.name}</p>
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
