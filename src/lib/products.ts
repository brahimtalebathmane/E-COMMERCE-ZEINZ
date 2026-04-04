import type { ProductRow } from "@/types";
import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";

function mapProduct(row: Record<string, unknown>): ProductRow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    slug: row.slug as string,
    old_slugs: (row.old_slugs as string[]) ?? [],
    price: Number(row.price),
    discount_price:
      row.discount_price === null || row.discount_price === undefined
        ? null
        : Number(row.discount_price),
    media_type: row.media_type as "image" | "video",
    media_url: row.media_url as string,
    features: (row.features as string[]) ?? [],
    gallery: (row.gallery as string[]) ?? [],
    testimonials: (row.testimonials as ProductRow["testimonials"]) ?? [],
    faqs: (row.faqs as ProductRow["faqs"]) ?? [],
    meta_pixel_id: (row.meta_pixel_id as string | null) ?? null,
    whatsapp_e164: (row.whatsapp_e164 as string | null) ?? null,
    form_title: (row.form_title as string) ?? "",
    form_fields: Array.isArray(row.form_fields)
      ? (row.form_fields as ProductRow["form_fields"])
      : [],
    created_at: row.created_at as string,
  };
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapProduct(data as Record<string, unknown>);
}

export async function getProductByOldSlug(
  slug: string,
): Promise<ProductRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .contains("old_slugs", [slug])
    .maybeSingle();

  if (error || !data) return null;
  return mapProduct(data as Record<string, unknown>);
}

export async function getAllProductSlugs(): Promise<{ slug: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("products").select("slug");

  if (error || !data) return [];
  return data.map((r) => ({ slug: (r as { slug: string }).slug }));
}
