"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  buildMetaPixelAdvancedMatching,
  loadStoredMetaPixelAdvancedMatching,
} from "@/lib/meta-pixel-advanced-matching";
import { unregisterLegacyRootSerwist } from "@/lib/legacy-serwist-cleanup";
import { refreshMetaPixelInitWithUserData, trackMetaPageView } from "@/lib/meta-pixel-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaPixelAdvancedMatchingProps } from "@/components/MetaPixel";

type Props = {
  pixelId: string | null | undefined;
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

/**
 * Single client-side Meta Pixel owner: init-once, one PageView per route, advanced matching via `set`.
 * Consolidates MetaPixelRuntime + MetaPixel so two effects never race on fbq('init').
 */
export function MetaPixelRuntime({ pixelId, advancedMatching }: Props) {
  const pathname = usePathname();
  const id = useMemo(
    () => normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId(pixelId),
    [pixelId],
  );
  const lastPageViewRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    void (async () => {
      const phone = advancedMatching?.phone?.trim() ?? "";
      const customerName = advancedMatching?.customerName?.trim() ?? "";
      const metaCookies = getMetaBrowserCookies();
      const storedAm = loadStoredMetaPixelAdvancedMatching(id);
      const am =
        buildMetaPixelAdvancedMatching({
          phone,
          customerName,
          fbp: metaCookies.fbp,
          fbc: metaCookies.fbc,
        }) ?? storedAm;
      refreshMetaPixelInitWithUserData(id, am ?? undefined);

      // Legacy root-scoped Serwist can block pixel beacons on first paint.
      await unregisterLegacyRootSerwist();
      if (cancelled) return;

      const routeKey =
        typeof window !== "undefined"
          ? `${id}:${window.location.pathname}${window.location.search}`
          : `${id}:${pathname}`;
      if (lastPageViewRef.current === routeKey) return;
      lastPageViewRef.current = routeKey;
      trackMetaPageView(id);

      // One delayed retry if fbq/fbevents.js was still loading on first paint.
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (!cancelled) trackMetaPageView(id);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    pathname,
    advancedMatching?.phone,
    advancedMatching?.customerName,
  ]);

  if (!id) return null;

  return (
    <div
      data-meta-pixel-id={id}
      aria-hidden
      className="hidden"
    />
  );
}
