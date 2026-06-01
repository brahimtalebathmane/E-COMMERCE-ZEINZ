"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMetaPageView } from "@/lib/meta-pixel-client";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

/**
 * Runs Meta Pixel on the client after hydration (all landing navigations).
 * Pair with MetaPixelBaseScript in HTML for Pixel Helper pixel detection.
 * Re-fires PageView on route change — inline scripts do not run on client navigations.
 */
export function MetaPixelRuntime({ pixelId }: Props) {
  const id = normalizeMetaPixelId(pixelId);
  const pathname = usePathname();

  useEffect(() => {
    if (!id) return;
    void trackMetaPageView(id);
  }, [id, pathname]);

  return null;
}
