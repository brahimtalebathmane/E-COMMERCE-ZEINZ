import type { ProductRow } from "@/types";
import { normalizeFormFields } from "@/lib/form-fields";
import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";

export function mapProductRow(row: Record<string, unknown>): ProductRow {
  const dlRaw = row.default_language;
  const default_language: ProductRow["default_language"] =
    dlRaw === "fr" ? "fr" : "ar";
  return {
    id: row.id as string,
    default_language,
    name_ar: row.name_ar as string,
    name_fr: (row.name_fr as string) ?? "",
    description_ar: (row.description_ar as string) ?? "",
    description_fr: (row.description_fr as string) ?? "",
    slug: row.slug as string,
    old_slugs: (row.old_slugs as string[]) ?? [],
    price: Number(row.price),
    discount_price:
      row.discount_price === null || row.discount_price === undefined
        ? null
        : Number(row.discount_price),
    media_type: row.media_type as "image" | "video",
    media_url: row.media_url as string,
    features_ar: (row.features_ar as string[]) ?? [],
    features_fr: (row.features_fr as string[]) ?? [],
    gallery: (row.gallery as string[]) ?? [],
    testimonials_ar: (row.testimonials_ar as ProductRow["testimonials_ar"]) ?? [],
    testimonials_fr: (row.testimonials_fr as ProductRow["testimonials_fr"]) ?? [],
    faqs_ar: (row.faqs_ar as ProductRow["faqs_ar"]) ?? [],
    faqs_fr: (row.faqs_fr as ProductRow["faqs_fr"]) ?? [],
    meta_pixel_id: (row.meta_pixel_id as string | null) ?? null,
    form_title_ar: (row.form_title_ar as string) ?? "",
    form_title_fr: (row.form_title_fr as string) ?? "",
    form_fields_ar: normalizeFormFields(row.form_fields_ar),
    form_fields_fr: normalizeFormFields(row.form_fields_fr),
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
  return mapProductRow(data as Record<string, unknown>);
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
  return mapProductRow(data as Record<string, unknown>);
}

export async function getProductById(id: string): Promise<ProductRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapProductRow(data as Record<string, unknown>);
}

export async function getAllProductSlugs(): Promise<{ slug: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("products").select("slug");

  if (error || !data) return [];
  return data.map((r) => ({ slug: (r as { slug: string }).slug }));
}
