import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { MetaPixelLandingScript } from "@/components/MetaPixelLandingScript";
import { HeroMediaPreload } from "@/components/landing/HeroMediaPreload";
import { ProductLanding } from "@/components/landing/ProductLanding";
import { resolveMetaProductDisplayName } from "@/lib/meta-product-custom-data";
import { resolveCountryPixelIds } from "@/lib/meta-pixel-id";
import { createPublicClient } from "@/lib/supabase/public";
import {
  getAllProductSlugs,
  getProductByOldSlug,
  getProductBySlug,
} from "@/lib/products";
import { isLandingVisible } from "@/lib/product-test-status";
import { buildPublicProductUrl } from "@/lib/site-url";
import type { ProductTestingStatus } from "@/types";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/** Fresh product record on every ad landing — avoids stale content_ids in inline Pixel script. */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const slugs = await getAllProductSlugs();
  return slugs;
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await getProductBySlug(slug);
  if (!found || !isLandingVisible(found.test_status as ProductTestingStatus)) {
    return {};
  }
  const url = buildPublicProductUrl(found.slug);
  const title = resolveMetaProductDisplayName(found);
  return {
    title,
    alternates: url ? { canonical: url } : undefined,
    openGraph: url
      ? {
          url,
          title,
          type: "website",
        }
      : undefined,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const found = await getProductBySlug(slug);
  if (!found) {
    const legacy = await getProductByOldSlug(slug);
    if (legacy) {
      if (!isLandingVisible(legacy.test_status as ProductTestingStatus)) {
        notFound();
      }
      permanentRedirect(`/${legacy.slug}`);
    }
    notFound();
  }

  if (!isLandingVisible(found.test_status)) {
    notFound();
  }

  const productContent = {
    productId: found.id,
    productName: resolveMetaProductDisplayName(found),
  };

  const publicSupabase = createPublicClient();
  const [countryPixelIds, countryRow] = await Promise.all([
    resolveCountryPixelIds(publicSupabase, found.country_id),
    publicSupabase.from("countries").select("currency").eq("id", found.country_id).maybeSingle(),
  ]);
  // Resolved from the product's own country, not the legacy
  // products.affiliate_currency free-text field (which can hold non-ISO
  // values entered by hand, e.g. an Arabic currency name instead of "SAR").
  const productCurrency = countryRow.data?.currency ?? "MRU";

  return (
    <>
      <MetaPixelLandingScript productContent={productContent} pixelId={countryPixelIds.public} />
      <HeroMediaPreload mediaType={found.media_type} mediaUrl={found.media_url} />
      <MetaPixelRuntime productContent={productContent} pixelId={countryPixelIds.public} />
      <ProductLanding
        product={found}
        metaPixelIdPublic={countryPixelIds.public}
        currency={productCurrency}
      />
    </>
  );
}
