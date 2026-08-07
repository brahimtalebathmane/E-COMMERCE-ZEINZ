import { headers } from "next/headers";
import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { MetaPixelLandingScript } from "@/components/MetaPixelLandingScript";
import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";
import { CatalogPageClient } from "@/components/store/CatalogPageClient";
import { StoreSiteFooter } from "@/components/store/StoreSiteFooter";
import type { CatalogProduct } from "@/components/store/CatalogProductCard";

/**
 * Was `revalidate = 60` (ISR). The geo-filter below reads a per-visitor
 * request header, which Next.js can only do for a dynamically-rendered
 * request — personalized content and a shared static cache are mutually
 * exclusive. With ~30 products this query is cheap, so trading ISR for
 * per-request rendering here is a deliberate, low-cost trade-off.
 */
export const dynamic = "force-dynamic";

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
    currency: (row.countries as { currency?: string } | null)?.currency ?? "MRU",
  };
}

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        {/* Catalog listing — generic PageView only; no per-card ViewContent (user navigates to /{slug}). */}
        <MetaPixelLandingScript />
        <MetaPixelRuntime />
        <CatalogPageClient products={[]} configured={false} />
        <StoreSiteFooter />
      </>
    );
  }

  const supabase = createPublicClient();

  // Set by netlify/edge-functions/geo-country.ts on "/" only. Absent locally
  // and whenever Netlify can't resolve the visitor's country (VPNs, bots).
  const visitorCountryCode = (await headers()).get("x-visitor-country-code");
  let visitorCountryId: string | null = null;
  let visitorCountryPixelId: string | null = null;
  if (visitorCountryCode) {
    const { data: countryRow } = await supabase
      .from("countries")
      .select("id, meta_pixel_id_public")
      .eq("iso_code", visitorCountryCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    const row = countryRow as { id: string; meta_pixel_id_public: string | null } | null;
    visitorCountryId = row?.id ?? null;
    visitorCountryPixelId = row?.meta_pixel_id_public ?? null;
  }

  let productsQuery = supabase
    .from("products")
    .select(
      "name_ar, name_fr, hero_subtitle_ar, hero_subtitle_fr, slug, discount_price, price, media_type, media_url, testimonials_ar, testimonials_fr, countries(currency)",
    )
    .eq("test_status", "winner")
    .is("deleted_at", null);

  // Only filter when a country was both detected AND matches a configured
  // row — an inconclusive detection or an unconfigured country (most of the
  // world today, since only MR/SA exist) falls back to the full catalog
  // rather than risk showing an empty storefront.
  if (visitorCountryId) {
    productsQuery = productsQuery.eq("country_id", visitorCountryId);
  }

  const { data } = await productsQuery.order("created_at", { ascending: false });

  const products = (data ?? []).map((row) =>
    normalizeCatalogRow(row as Record<string, unknown>),
  );

  return (
    <>
      <MetaPixelLandingScript pixelId={visitorCountryPixelId} />
      <MetaPixelRuntime pixelId={visitorCountryPixelId} />
      <CatalogPageClient products={products} configured />
      <StoreSiteFooter />
    </>
  );
}
