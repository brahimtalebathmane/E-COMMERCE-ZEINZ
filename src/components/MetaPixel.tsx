"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaPixelAdvancedMatching,
  type MetaPixelAdvancedMatchingPayload,
  buildMetaPixelInitUserData,
  loadStoredMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
} from "@/lib/meta-pixel-advanced-matching";
import {
  refreshMetaPixelInitWithUserData,
  trackMetaEvent,
  trackMetaPageView,
} from "@/lib/meta-pixel-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
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

/** Advanced matching + deduped PageView fallback (MetaPixelRuntime is primary). */
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
    const initUserData = buildMetaPixelInitUserData(resolvedPixelId, am);

    if (typeof window !== "undefined" && window.fbq && initUserData) {
      window.fbq("set", "userData", initUserData as Record<string, unknown>);
    }
    trackMetaPageView(resolvedPixelId);
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
  contentName?: string | null,
) {
  const customData: Record<string, unknown> = {};
  const name = contentName?.trim();
  if (name) customData.content_name = name;
  void trackMetaEvent(
    pixelId,
    "InitiateCheckout",
    Object.keys(customData).length > 0 ? customData : undefined,
    { eventID: eventId },
  );
}

export function trackPurchase(params: {
  eventId: string;
  valueMru: number;
  currency?: string;
}) {
  const { value, currency } = toMetaPixelPurchaseMoney(
    params.valueMru,
    params.currency ?? "MRU",
  );
  void trackMetaEvent(null, "Purchase", { value, currency }, { eventID: params.eventId });
}

export async function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
  pixelId?: string | null;
  phone?: string;
  customerName?: string;
}): Promise<void> {
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  const pid = resolvePublicMetaPixelId(params.pixelId);
  let am: MetaPixelAdvancedMatchingPayload | undefined;

  if (pid && params.phone?.trim() && params.customerName?.trim()) {
    syncMetaPixelAdvancedMatching(pid, {
      phone: params.phone,
      customerName: params.customerName,
    });
    const metaCookies = getMetaBrowserCookies();
    am = buildMetaPixelAdvancedMatching({
      phone: params.phone,
      customerName: params.customerName,
      fbp: metaCookies.fbp,
      fbc: metaCookies.fbc,
    });
  }

  trackMetaEvent(
    params.pixelId,
    "Lead",
    { value, currency },
    { eventID: params.eventId, advancedMatching: am },
  );
}
