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

function normalizeCatalogRow(
  row: Record<string, unknown>,
  countryCurrencyById: Map<string, string>,
): CatalogProduct {
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
    currency: countryCurrencyById.get(String(row.country_id ?? "")) ?? "MRU",
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

  // Anon reads only ever go through the *_public views (no server pixel /
  // cost columns) — see supabase/migrations/057_products_public_view.sql
  // and 059_countries_public_view.sql. PostgREST's `table(column)` FK
  // embedding (used here previously for `countries(currency)`) doesn't
  // resolve through a plain view, so currency is joined in JS below instead.
  const { data: countryRows } = await supabase
    .from("countries_public")
    .select("id, iso_code, currency, meta_pixel_id_public");
  const countries = (countryRows ?? []) as {
    id: string;
    iso_code: string;
    currency: string;
    meta_pixel_id_public: string | null;
  }[];
  const countryCurrencyById = new Map(countries.map((c) => [c.id, c.currency]));

  // Set by netlify/edge-functions/geo-country.ts on "/" only. Absent locally
  // and whenever Netlify can't resolve the visitor's country (VPNs, bots).
  const visitorCountryCode = (await headers()).get("x-visitor-country-code");
  let visitorCountryId: string | null = null;
  let visitorCountryPixelId: string | null = null;
  if (visitorCountryCode) {
    const row = countries.find((c) => c.iso_code === visitorCountryCode.toUpperCase()) ?? null;
    visitorCountryId = row?.id ?? null;
    visitorCountryPixelId = row?.meta_pixel_id_public ?? null;
  }

  let productsQuery = supabase
    .from("products_public")
    .select(
      "name_ar, name_fr, hero_subtitle_ar, hero_subtitle_fr, slug, discount_price, price, media_type, media_url, testimonials_ar, testimonials_fr, country_id",
    )
    .eq("test_status", "winner");

  // Only filter when a country was both detected AND matches a configured
  // row — an inconclusive detection or an unconfigured country (most of the
  // world today, since only MR/SA exist) falls back to the full catalog
  // rather than risk showing an empty storefront.
  if (visitorCountryId) {
    productsQuery = productsQuery.eq("country_id", visitorCountryId);
  }

  const { data } = await productsQuery.order("created_at", { ascending: false });

  const products = (data ?? []).map((row) =>
    normalizeCatalogRow(row as Record<string, unknown>, countryCurrencyById),
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
