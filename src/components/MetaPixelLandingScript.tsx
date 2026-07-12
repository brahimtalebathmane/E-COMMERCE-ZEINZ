import {
  buildMetaPixelCatalogPageViewScript,
  buildMetaPixelProductLandingScript,
  type MetaLandingProductContent,
} from "@/lib/meta-pixel-landing-script";

type Props = {
  /** When set, fires ViewContent with content_ids (PageView comes from standard init). */
  productContent?: MetaLandingProductContent | null;
};

/** Server-rendered Pixel bootstrap — runs before client hydration. */
export function MetaPixelLandingScript({ productContent }: Props) {
  const js = productContent
    ? buildMetaPixelProductLandingScript(productContent)
    : buildMetaPixelCatalogPageViewScript();

  if (!js) return null;

  return (
    <script
      id={productContent ? "meta-pixel-product-landing" : "meta-pixel-catalog-pageview"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: js }}
    />
  );
}
