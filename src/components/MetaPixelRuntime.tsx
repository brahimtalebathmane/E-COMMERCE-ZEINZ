"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMetaPageView } from "@/lib/meta-pixel-client";
import { resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

/**
 * Client-side init + PageView for every store route and pixel ID.
 * Resolves per-product meta_pixel_id (or env fallback) and applies manual advanced matching.
 */
export function MetaPixelRuntime({ pixelId }: Props) {
  const id = resolvePublicMetaPixelId(pixelId);
  const pathname = usePathname();
  // Per-mount guard: blocks React StrictMode's double effect invoke before the
  // global window dedupe key is written on the first synchronous pass.
  const lastPageViewRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const routeKey =
      typeof window !== "undefined"
        ? `${id}:${window.location.pathname}${window.location.search}`
        : `${id}:${pathname}`;
    if (lastPageViewRef.current === routeKey) return;
    lastPageViewRef.current = routeKey;
    trackMetaPageView(id);
  }, [id, pathname]);

  return null;
}
