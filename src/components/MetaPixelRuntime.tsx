"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMetaPageView } from "@/lib/meta-pixel-client";
import { resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

/**
 * Client-side init + PageView (and route changes). fbq bootstrap loads from root layout.
 */
export function MetaPixelRuntime({ pixelId }: Props) {
  const id = resolvePublicMetaPixelId(pixelId);
  const pathname = usePathname();

  useEffect(() => {
    if (!id) return;
    void trackMetaPageView(id);
  }, [id, pathname]);

  return null;
}
