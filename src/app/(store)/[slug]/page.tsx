import { MetaPixel } from "@/components/MetaPixel";
import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { HeroMediaPreload } from "@/components/landing/HeroMediaPreload";
import { ProductLanding } from "@/components/landing/ProductLanding";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
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

  const productPixelId = resolveServerMetaPixelId(found.meta_pixel_id);

  return (
    <>
      <HeroMediaPreload mediaType={found.media_type} mediaUrl={found.media_url} />
      <MetaPixelRuntime pixelId={productPixelId} />
      <MetaPixel pixelId={productPixelId} />
      <ProductLanding product={found} resolvedMetaPixelId={productPixelId} />
    </>
  );
}
