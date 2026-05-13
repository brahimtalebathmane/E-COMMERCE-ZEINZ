import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";
import { CatalogPageClient } from "@/components/store/CatalogPageClient";
import type { CatalogProduct } from "@/components/store/CatalogProductCard";

export const revalidate = 60;

function normalizeCatalogRow(row: Record<string, unknown>): CatalogProduct {
  const mediaType = row.media_type === "video" ? "video" : "image";
  return {
    name_ar: String(row.name_ar ?? ""),
    name_fr: String(row.name_fr ?? ""),
    hero_subtitle_ar: String(row.hero_subtitle_ar ?? ""),
    hero_subtitle_fr: String(row.hero_subtitle_fr ?? ""),
    slug: String(row.slug ?? ""),
    discount_price:
      row.discount_price === null || row.discount_price === undefined
        ? null
        : Number(row.discount_price),
    price: Number(row.price ?? 0),
    media_type: mediaType,
    media_url: String(row.media_url ?? ""),
    testimonials_ar: row.testimonials_ar,
    testimonials_fr: row.testimonials_fr,
  };
}

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <CatalogPageClient products={[]} configured={false} />;
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select(
      "name_ar, name_fr, hero_subtitle_ar, hero_subtitle_fr, slug, discount_price, price, media_type, media_url, testimonials_ar, testimonials_fr",
    )
    .order("created_at", { ascending: false });

  const products = (data ?? []).map((row) =>
    normalizeCatalogRow(row as Record<string, unknown>),
  );

  return <CatalogPageClient products={products} configured />;
}
