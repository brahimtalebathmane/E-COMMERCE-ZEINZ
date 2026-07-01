"use client";

import { useLayoutEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  buildMetaPixelAdvancedMatching,
  loadStoredMetaPixelAdvancedMatching,
} from "@/lib/meta-pixel-advanced-matching";
import { refreshMetaPixelInitWithUserData, trackMetaPageView } from "@/lib/meta-pixel-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaPixelAdvancedMatchingProps } from "@/components/MetaPixel";

type Props = {
  pixelId: string | null | undefined;
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

/**
 * Client-side Meta Pixel owner: init-once, one PageView per route, advanced matching via merge.
 * Landing pages also render MetaPixelLandingScript for an immediate pre-hydration PageView;
 * this component dedupes and refreshes advanced matching after React hydrates.
 */
export function MetaPixelRuntime({ pixelId, advancedMatching }: Props) {
  const pathname = usePathname();
  const id = useMemo(
    () => normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId(pixelId),
    [pixelId],
  );

  useLayoutEffect(() => {
    if (!id) return;

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

    void trackMetaPageView(id);
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
