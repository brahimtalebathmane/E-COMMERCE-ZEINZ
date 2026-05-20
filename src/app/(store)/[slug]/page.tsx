import { ProductLanding } from "@/components/landing/ProductLanding";
import {
  getAllProductSlugs,
  getProductByOldSlug,
  getProductBySlug,
} from "@/lib/products";
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
      if (legacy.test_status === "failed") {
        notFound();
      }
      redirect(`/${legacy.slug}`);
    }
    notFound();
  }

  if (found.test_status === "failed") {
    notFound();
  }

  return <ProductLanding product={found} />;
}
