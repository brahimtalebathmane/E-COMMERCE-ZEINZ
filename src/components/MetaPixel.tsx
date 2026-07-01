"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaOrderValueCustomData,
  buildMetaProductCustomData,
} from "@/lib/meta-product-custom-data";
import {
  buildMetaPixelAdvancedMatching,
  type MetaPixelAdvancedMatchingPayload,
  loadStoredMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
} from "@/lib/meta-pixel-advanced-matching";
import {
  refreshMetaPixelInitWithUserData,
  trackMetaEvent,
} from "@/lib/meta-pixel-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { hashMetaExternalId } from "@/lib/meta-external-id-hash";
import { tryMarkBrowserLeadSent } from "@/lib/meta-lead-client";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

export type MetaPixelAdvancedMatchingProps = {
  phone?: string | null;
  customerName?: string | null;
};

type Props = {
  pixelId: string | null | undefined;
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

export function syncMetaPixelAdvancedMatching(
  pixelId: string | null | undefined,
  input: { phone: string; customerName: string },
) {
  const id = resolvePublicMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return;
  const metaCookies = getMetaBrowserCookies();
  const am = buildMetaPixelAdvancedMatching({
    ...input,
    fbp: metaCookies.fbp,
    fbc: metaCookies.fbc,
  });
  if (!am) return;
  try {
    sessionStorage.setItem(metaPixelAmStorageKey(id), JSON.stringify(am));
  } catch {
    // ignore
  }
  refreshMetaPixelInitWithUserData(id, am);
}

/**
 * Advanced matching only. PageView is owned exclusively by MetaPixelRuntime so a
 * single route load never fires two PageViews. This component just keeps the
 * pixel's userData fresh (init happens once; AM is applied via `set`).
 */
export function MetaPixel({ pixelId, advancedMatching }: Props) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const resolvedPixelId = useMemo(
    () => normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId(null),
    [pixelId],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!resolvedPixelId || !mounted) return;

    const phone = advancedMatching?.phone?.trim() ?? "";
    const customerName = advancedMatching?.customerName?.trim() ?? "";
    const metaCookies = getMetaBrowserCookies();
    const storedAm = loadStoredMetaPixelAdvancedMatching(resolvedPixelId);
    const am =
      buildMetaPixelAdvancedMatching({
        phone,
        customerName,
        fbp: metaCookies.fbp,
        fbc: metaCookies.fbc,
      }) ?? storedAm;
    // Ensure init-once and push advanced matching via `set` (no re-init, no PageView here).
    refreshMetaPixelInitWithUserData(resolvedPixelId, am ?? undefined);
  }, [
    resolvedPixelId,
    mounted,
    pathname,
    advancedMatching?.phone,
    advancedMatching?.customerName,
  ]);

  if (!resolvedPixelId || !mounted) return null;

  return (
    <div
      data-meta-pixel-id={resolvedPixelId}
      aria-hidden
      className="hidden"
    />
  );
}

export function trackInitiateCheckout(
  eventId: string,
  pixelId?: string | null,
  product?: { productId: string; productName: string } | null,
) {
  const customData = product?.productId
    ? buildMetaProductCustomData({
        productId: product.productId,
        productName: product.productName,
      })
    : undefined;
  void trackMetaEvent(pixelId, "InitiateCheckout", customData, { eventID: eventId });
}

export async function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity?: number;
  pixelId?: string | null;
  phone?: string;
  customerName?: string;
}): Promise<void> {
  if (!tryMarkBrowserLeadSent(params.orderId)) return;

  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  const leadCustomData = buildMetaOrderValueCustomData({
    value,
    currency,
    productId: params.productId,
    productName: params.productName,
    quantity: params.quantity,
  });

  // Queue Pixel Lead immediately with eventID — Meta pairs this with CAPI via event_id.
  trackMetaEvent(params.pixelId, "Lead", leadCustomData, { eventID: params.eventId });

  const pid = resolvePublicMetaPixelId(params.pixelId);
  if (!pid || !params.phone?.trim() || !params.customerName?.trim()) return;

  syncMetaPixelAdvancedMatching(pid, {
    phone: params.phone,
    customerName: params.customerName,
  });
  const externalIdHash = params.orderId.trim()
    ? await hashMetaExternalId(params.orderId)
    : undefined;
  const metaCookies = getMetaBrowserCookies();
  const am = buildMetaPixelAdvancedMatching({
    phone: params.phone,
    customerName: params.customerName,
    fbp: metaCookies.fbp,
    fbc: metaCookies.fbc,
    externalIdHash,
  });
  if (am) refreshMetaPixelInitWithUserData(pid, am);
}
