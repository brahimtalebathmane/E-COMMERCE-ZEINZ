"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaOrderValueCustomData,
  buildMetaProductCustomData,
} from "@/lib/meta-product-custom-data";
import {
  buildMetaPixelAdvancedMatching,
  loadStoredMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
} from "@/lib/meta-pixel-advanced-matching";
import {
  refreshMetaPixelInitWithUserData,
  trackMetaEvent,
  trackMetaLead,
} from "@/lib/meta-pixel-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { hashMetaExternalId } from "@/lib/meta-external-id-hash";
import { tryMarkBrowserLeadSent } from "@/lib/meta-lead-client";
import { resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

export type MetaPixelAdvancedMatchingProps = {
  phone?: string | null;
  customerName?: string | null;
};

type Props = {
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

export function syncMetaPixelAdvancedMatching(input: {
  phone: string;
  customerName: string;
}) {
  const id = resolvePublicMetaPixelId();
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
 * Advanced matching only. Prefer MetaPixelRuntime (combined init + PageView + AM).
 */
export function MetaPixel({ advancedMatching }: Props) {
  const pathname = usePathname();
  const resolvedPixelId = useMemo(() => resolvePublicMetaPixelId(), []);

  useEffect(() => {
    if (!resolvedPixelId) return;

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
    refreshMetaPixelInitWithUserData(resolvedPixelId, am ?? undefined);
  }, [
    resolvedPixelId,
    pathname,
    advancedMatching?.phone,
    advancedMatching?.customerName,
  ]);

  if (!resolvedPixelId) return null;

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
  product?: {
    productId: string;
    productName: string;
    value?: number;
    currency?: string;
  } | null,
) {
  if (!eventId.trim()) {
    console.error("[meta] InitiateCheckout skipped: missing event_id");
    return;
  }
  if (!product?.productId?.trim()) {
    console.error("[meta] InitiateCheckout skipped: missing productId");
    return;
  }

  let customData: Record<string, unknown> | undefined;
  if (
    product.value != null &&
    Number.isFinite(product.value) &&
    product.currency?.trim()
  ) {
    const { value, currency } = toMetaPixelPurchaseMoney(product.value, product.currency);
    customData = buildMetaOrderValueCustomData({
      value,
      currency,
      productId: product.productId,
      productName: product.productName,
    });
  } else {
    customData = buildMetaProductCustomData({
      productId: product.productId,
      productName: product.productName,
    });
  }

  const contentIds = customData?.content_ids;
  if (!Array.isArray(contentIds) || contentIds.length === 0) {
    console.error("[meta] InitiateCheckout skipped: unresolved content_ids", {
      productId: product.productId,
    });
    return;
  }

  void trackMetaEvent(undefined, "InitiateCheckout", customData, { eventID: eventId });
}

export async function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity?: number;
  phone?: string;
  customerName?: string;
}): Promise<void> {
  if (!tryMarkBrowserLeadSent(params.orderId)) return;

  const pid = resolvePublicMetaPixelId();
  if (!pid) return;

  let advancedMatching = null as ReturnType<typeof buildMetaPixelAdvancedMatching> | null;
  if (params.phone?.trim() && params.customerName?.trim()) {
    const externalIdHash = params.orderId.trim()
      ? await hashMetaExternalId(params.orderId)
      : undefined;
    const metaCookies = getMetaBrowserCookies();
    advancedMatching =
      buildMetaPixelAdvancedMatching({
        phone: params.phone,
        customerName: params.customerName,
        fbp: metaCookies.fbp,
        fbc: metaCookies.fbc,
        externalIdHash,
      }) ?? null;
    if (advancedMatching) {
      try {
        sessionStorage.setItem(
          metaPixelAmStorageKey(pid),
          JSON.stringify({
            ph: advancedMatching.ph,
            fn: advancedMatching.fn,
            ln: advancedMatching.ln,
          }),
        );
      } catch {
        // ignore quota / private mode
      }
    }
  }

  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  const leadCustomData = buildMetaOrderValueCustomData({
    value,
    currency,
    productId: params.productId,
    productName: params.productName,
    quantity: params.quantity,
  });

  if (!leadCustomData?.content_ids?.length) {
    console.error("[meta] Browser Lead skipped: unresolved content_ids", {
      orderId: params.orderId,
      productId: params.productId,
    });
    return;
  }

  const result = await trackMetaLead(pid, leadCustomData, {
    eventID: params.eventId,
    advancedMatching,
  });

  if (!result.sent && result.reason === "duplicate_pixel_registration") {
    console.warn("[Meta] Browser Lead skipped (duplicate fbq registration); relying on CAPI Lead", {
      orderId: params.orderId,
      eventId: params.eventId,
    });
  }
}
