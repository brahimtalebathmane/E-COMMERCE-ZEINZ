"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMetaPageView } from "@/lib/meta-pixel-client";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

/**
 * Client-side init + PageView (and route changes). fbq bootstrap loads from root layout Script.
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
