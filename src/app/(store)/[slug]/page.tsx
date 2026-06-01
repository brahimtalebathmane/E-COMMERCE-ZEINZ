import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { ProductLanding } from "@/components/landing/ProductLanding";
import {
  extractMetaPixelIdFromRow,
  resolveServerMetaPixelId,
} from "@/lib/meta-pixel-id";
import {
  getAllProductSlugs,
  getProductByOldSlug,
  getProductBySlug,
} from "@/lib/products";
import { isLandingVisible } from "@/lib/product-test-status";
import type { ProductTestingStatus } from "@/types";
import { notFound, redirect } from "next/navigation";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getAllProductSlugs();
  return slugs;
}

type PageProps = { params: Promise<{ slug: string }> };

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const found = await getProductBySlug(slug);
  if (!found) {
    const legacy = await getProductByOldSlug(slug);
    if (legacy) {
      if (!isLandingVisible(legacy.test_status as ProductTestingStatus)) {
        notFound();
      }
      redirect(`/${legacy.slug}`);
    }
    notFound();
  }

  if (!isLandingVisible(found.test_status)) {
    notFound();
  }

  console.error("[DEBUG-ROUTING] Product Pixel ID from DB is:", found.meta_pixel_id);
  console.error("[DEBUG-ROUTING] Alternate pixel keys on product row:", {
    meta_pixel_id: found.meta_pixel_id,
    extracted_raw: extractMetaPixelIdFromRow(
      found as unknown as Record<string, unknown>,
    ),
    slug: found.slug,
    product_id: found.id,
  });

  const productPixelId = resolveServerMetaPixelId(found.meta_pixel_id);

  console.error("[DEBUG-ROUTING] Resolved product pixel ID:", productPixelId);

  return (
    <>
      <MetaPixelRuntime pixelId={productPixelId} />
      <ProductLanding product={found} resolvedMetaPixelId={productPixelId} />
    </>
  );
}
