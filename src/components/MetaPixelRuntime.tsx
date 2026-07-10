"use client";

import { useLayoutEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  buildMetaPixelAdvancedMatching,
  loadStoredMetaPixelAdvancedMatching,
} from "@/lib/meta-pixel-advanced-matching";
import {
  refreshMetaPixelInitWithUserData,
  trackMetaPageView,
  trackMetaViewContent,
} from "@/lib/meta-pixel-client";
import { resolveMetaContentData } from "@/lib/meta-product-custom-data";
import type { MetaLandingProductContent } from "@/lib/meta-pixel-landing-script";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaPixelAdvancedMatchingProps } from "@/components/MetaPixel";

type Props = {
  /** Product landing: fires ViewContent with content_ids after hydration (PageView dedupes with pre-hydration script). */
  productContent?: MetaLandingProductContent | null;
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

/**
 * Client-side Meta Pixel owner: init-once, PageView per route, ViewContent on product landings.
 * Catalog routes fire generic PageView only (listing page — no product content_ids).
 */
export function MetaPixelRuntime({ productContent, advancedMatching }: Props) {
  const pathname = usePathname();
  const id = useMemo(() => resolvePublicMetaPixelId(), []);

  const viewContentPayload = useMemo(() => {
    if (!productContent?.productId?.trim()) return null;
    return resolveMetaContentData({
      productId: productContent.productId,
      productName: productContent.productName,
    });
  }, [productContent?.productId, productContent?.productName]);

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
    if (viewContentPayload) {
      void trackMetaViewContent(viewContentPayload, id);
    }
  }, [
    id,
    pathname,
    viewContentPayload,
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
