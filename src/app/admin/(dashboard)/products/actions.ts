"use server";

import { RESERVED_SLUGS } from "@/lib/constants";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import type { FormFieldConfig, Testimonial, FAQ } from "@/types";
import { revalidatePath } from "next/cache";

export type ProductPayload = {
  name: string;
  description: string;
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
  features: string[];
  gallery: string[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  meta_pixel_id: string | null;
  /** E.164 digits only; null clears to env fallback on storefront. */
  whatsapp_e164: string | null;
  form_title: string;
  form_fields: FormFieldConfig[];
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
  name: string,
): Promise<string> {
  const base = slugify(name);
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

  const candidate = await allocateUniqueSlug(supabase, payload.name);

  const { error } = await supabase.from("products").insert({
    name: payload.name.trim(),
    description: payload.description,
    slug: candidate,
    old_slugs: payload.old_slugs.filter(Boolean),
    price: payload.price,
    discount_price: payload.discount_price,
    media_type: payload.media_type,
    media_url: payload.media_url.trim(),
    features: payload.features,
    gallery: payload.gallery,
    testimonials: payload.testimonials,
    faqs: payload.faqs,
    meta_pixel_id: payload.meta_pixel_id?.trim() || null,
    whatsapp_e164: payload.whatsapp_e164,
    form_title: payload.form_title.trim(),
    form_fields: payload.form_fields,
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
      name: payload.name.trim(),
      description: payload.description,
      price: payload.price,
      discount_price: payload.discount_price,
      media_type: payload.media_type,
      media_url: payload.media_url.trim(),
      features: payload.features,
      gallery: payload.gallery,
      testimonials: payload.testimonials,
      faqs: payload.faqs,
      meta_pixel_id: payload.meta_pixel_id?.trim() || null,
      whatsapp_e164: payload.whatsapp_e164,
      form_title: payload.form_title.trim(),
      form_fields: payload.form_fields,
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
