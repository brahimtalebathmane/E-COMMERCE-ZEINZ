"use client";

import { useEffect } from "react";
import { trackPurchase } from "@/components/MetaPixel";

type Props = {
  orderId: string | null;
  productId: string | null;
  productName: string | null;
  totalPrice: number | null;
  currency: string;
};

async function waitForFbqReady(timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (typeof window !== "undefined" && typeof window.fbq === "function") return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function firedKey(orderId: string) {
  return `pixel_purchase_fired:${orderId}`;
}

export function OrderSuccessClient({
  orderId,
  productId,
  productName,
  totalPrice,
  currency,
}: Props) {
  useEffect(() => {
    if (!orderId) return;

    try {
      if (localStorage.getItem(firedKey(orderId)) === "1") return;
    } catch {
      // ignore storage errors; we'll still attempt a single fire per page load
    }

    const value = typeof totalPrice === "number" && Number.isFinite(totalPrice) ? totalPrice : null;
    if (value == null) return;
    if (!productId) return;

    let cancelled = false;

    (async () => {
      const ok = await waitForFbqReady(3000);
      if (!ok || cancelled) return;

      trackPurchase({
        value,
        currency,
        content_name: productName ?? productId,
        content_ids: [productId],
        content_type: "product",
      });

      try {
        localStorage.setItem(firedKey(orderId), "1");
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, productId, productName, totalPrice, currency]);

  return null;
}

