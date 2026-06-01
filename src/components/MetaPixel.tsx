"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
} from "@/lib/meta-pixel-advanced-matching";
import { trackMetaEvent, trackMetaPageView } from "@/lib/meta-pixel-client";
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
  const am = buildMetaPixelAdvancedMatching(input);
  if (!am) return;
  try {
    sessionStorage.setItem(metaPixelAmStorageKey(id), JSON.stringify(am));
  } catch {
    // ignore
  }
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
    const am = buildMetaPixelAdvancedMatching({ phone, customerName });

    if (am && typeof window !== "undefined" && window.fbq) {
      window.fbq("set", "userData", am as Record<string, unknown>);
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

export function trackInitiateCheckout(eventId: string, pixelId?: string | null) {
  void trackMetaEvent(pixelId, "InitiateCheckout", {}, { eventID: eventId });
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
}): Promise<void> {
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  trackMetaEvent(
    params.pixelId,
    "Lead",
    { value, currency },
    { eventID: params.eventId },
  );
}
