import {
  buildMetaPixelCatalogPageViewScript,
  buildMetaPixelProductLandingScript,
  type MetaLandingProductContent,
} from "@/lib/meta-pixel-landing-script";

type Props = {
  /** When set, fires ViewContent with content_ids (PageView comes from standard init). */
  productContent?: MetaLandingProductContent | null;
  /** Country-specific pixel (from countries.meta_pixel_id_public); falls back to env when unset. */
  pixelId?: string | null;
};

/** Server-rendered Pixel bootstrap — runs before client hydration. */
export function MetaPixelLandingScript({ productContent, pixelId }: Props) {
  const js = productContent
    ? buildMetaPixelProductLandingScript(productContent, pixelId)
    : buildMetaPixelCatalogPageViewScript(pixelId);

  if (!js) return null;

  return (
    <script
      id={productContent ? "meta-pixel-product-landing" : "meta-pixel-catalog-pageview"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: js }}
    />
  );
}
