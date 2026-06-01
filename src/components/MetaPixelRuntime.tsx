"use client";

import { useEffect } from "react";
import { trackMetaPageView } from "@/lib/meta-pixel-client";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

/**
 * Runs Meta Pixel on the client after hydration (all landing navigations).
 * Pair with MetaPixelBaseScript in HTML for Pixel Helper pixel detection.
 */
export function MetaPixelRuntime({ pixelId }: Props) {
  const id = normalizeMetaPixelId(pixelId);

  useEffect(() => {
    if (!id) return;
    void trackMetaPageView(id);
  }, [id]);

  return null;
}
