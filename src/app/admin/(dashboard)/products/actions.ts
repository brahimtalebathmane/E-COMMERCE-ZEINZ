"use server";

import { RESERVED_SLUGS } from "@/lib/constants";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import type { Testimonial, FAQ } from "@/types";
import { revalidatePath } from "next/cache";

export type ProductPayload = {
  /** Default storefront language for this landing page. */
  default_language: "ar" | "fr";
  name_ar: string;
  name_fr: string;
  description_ar: string;
  description_fr: string;
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
  features_ar: string[];
  features_fr: string[];
  gallery: string[];
  testimonials_ar: Testimonial[];
  testimonials_fr: Testimonial[];
  faqs_ar: FAQ[];
  faqs_fr: FAQ[];
  meta_pixel_id: string | null;
  old_slugs: string[];
};

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return supabase;
}

async function slugExists(supabase: Awaited<ReturnType<typeof createClient>>, slug: string) {
  const { data } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
  return !!data;
}

async function allocateUniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nameAr: string,
): Promise<string> {
  const base = slugify(nameAr);
  if (!base || RESERVED_SLUGS.has(base)) {
    throw new Error("Choose a different product name (reserved or empty slug).");
  }

  let candidate = base;
  for (let i = 0; i < 80; i += 1) {
    const taken = await slugExists(supabase, candidate);
    if (!taken && !RESERVED_SLUGS.has(candidate)) {
      return candidate;
    }
    candidate = `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  throw new Error("Could not allocate a unique slug — try again.");
}

export async function createProductAction(payload: ProductPayload) {
  const supabase = await assertAdmin();

  const candidate = await allocateUniqueSlug(supabase, payload.name_ar);

  const { error } = await supabase.from("products").insert({
    default_language: payload.default_language,
    name_ar: payload.name_ar.trim(),
    name_fr: payload.name_fr.trim(),
    description_ar: payload.description_ar,
    description_fr: payload.description_fr,
    slug: candidate,
    old_slugs: payload.old_slugs.filter(Boolean),
    price: payload.price,
    discount_price: payload.discount_price,
    media_type: payload.media_type,
    media_url: payload.media_url.trim(),
    features_ar: payload.features_ar,
    features_fr: payload.features_fr,
    gallery: payload.gallery,
    testimonials_ar: payload.testimonials_ar,
    testimonials_fr: payload.testimonials_fr,
    faqs_ar: payload.faqs_ar,
    faqs_fr: payload.faqs_fr,
    meta_pixel_id: payload.meta_pixel_id?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/${candidate}`);
  revalidatePath("/admin/products");
}

export async function updateProductAction(id: string, payload: ProductPayload) {
  const supabase = await assertAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from("products")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new Error("Product not found");
  }

  const { error } = await supabase
    .from("products")
    .update({
      default_language: payload.default_language,
      name_ar: payload.name_ar.trim(),
      name_fr: payload.name_fr.trim(),
      description_ar: payload.description_ar,
      description_fr: payload.description_fr,
      price: payload.price,
      discount_price: payload.discount_price,
      media_type: payload.media_type,
      media_url: payload.media_url.trim(),
      features_ar: payload.features_ar,
      features_fr: payload.features_fr,
      gallery: payload.gallery,
      testimonials_ar: payload.testimonials_ar,
      testimonials_fr: payload.testimonials_fr,
      faqs_ar: payload.faqs_ar,
      faqs_fr: payload.faqs_fr,
      meta_pixel_id: payload.meta_pixel_id?.trim() || null,
      old_slugs: payload.old_slugs.filter(Boolean),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/${existing.slug}`);
  revalidatePath("/admin/products");
}

export async function deleteProductAction(id: string) {
  const supabase = await assertAdmin();

  const { data: existing } = await supabase
    .from("products")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (existing?.slug) {
    revalidatePath(`/${existing.slug}`);
  }
  revalidatePath("/");
  revalidatePath("/admin/products");
}
