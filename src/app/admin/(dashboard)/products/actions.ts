"use server";

import { RESERVED_SLUGS } from "@/lib/constants";
import { normalizeHexColor, normalizeOptionalHexColor } from "@/lib/color";
import { slugify } from "@/lib/slug";
import { BRAND_COLOR } from "@/lib/site-branding";
import { createClient } from "@/lib/supabase/server";
import type { Testimonial, FAQ } from "@/types";
import { revalidatePath } from "next/cache";

export type ProductPayload = {
  /** Default storefront language for this landing page. */
  default_language: "ar" | "fr";
  /** Landing accent (#rrggbb). */
  brand_color: string;
  name_ar: string;
  name_fr: string;
  hero_subtitle_ar: string;
  hero_subtitle_fr: string;
  hero_badge_ar: string;
  hero_badge_fr: string;
  logo_url: string;
  header_offer_text_ar: string;
  header_offer_text_fr: string;
  header_discount_text_ar: string;
  header_discount_text_fr: string;
  header_promo_text_ar: string;
  header_promo_text_fr: string;
  header_announcement_text_ar: string;
  header_announcement_text_fr: string;
  header_cta_text_ar: string;
  header_cta_text_fr: string;
  offer_badge_ar: string;
  offer_badge_fr: string;
  offer_discount_text_ar: string;
  offer_discount_text_fr: string;
  offer_limited_text_ar: string;
  offer_limited_text_fr: string;
  description_ar: string;
  description_fr: string;
  cta_text_ar: string;
  cta_text_fr: string;
  features_title_ar: string;
  features_title_fr: string;
  testimonials_title_ar: string;
  testimonials_title_fr: string;
  media_caption_ar: string;
  media_caption_fr: string;
  faq_title_ar: string;
  faq_title_fr: string;
  stats_section_title_ar: string;
  stats_section_title_fr: string;
  testimonials_badge_ar: string;
  testimonials_badge_fr: string;
  footer_note_ar: string;
  footer_note_fr: string;
  cta_banner_background_color: string;
  cta_banner_background_image_url: string;
  cta_banner_image_overlay: number;
  contact_title_ar: string;
  contact_title_fr: string;
  whatsapp_message_template: string | null;
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
  secondary_media_type: "image" | "video";
  secondary_media_url: string;
  tertiary_media_type: "image" | "video";
  tertiary_media_url: string;
  features_ar: string[];
  features_fr: string[];
  gallery: string[];
  testimonials_ar: Testimonial[];
  testimonials_fr: Testimonial[];
  faqs_ar: FAQ[];
  faqs_fr: FAQ[];
  stats_ar: string[];
  stats_fr: string[];
  contact_lines_ar: string[];
  contact_lines_fr: string[];
  meta_pixel_id: string | null;
  old_slugs: string[];
  sticky_footer_offer_ends_at: string | null;
  sticky_footer_timer_label_ar: string;
  sticky_footer_timer_label_fr: string;
  sticky_footer_savings_badge_ar: string;
  sticky_footer_savings_badge_fr: string;
  sticky_footer_bar_bg_color: string;
  sticky_footer_badge_bg_color: string;
  sticky_footer_timer_box_bg_color: string;
  sticky_footer_timer_digit_color: string;
  sticky_footer_cta_bg_color: string;
  sticky_footer_cta_text_color: string;
  sticky_footer_show_timer: boolean;
};

function trimText(v: string): string {
  return v.trim();
}

function trimList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function validateProductPayload(payload: ProductPayload) {
  const requiredText = [
    payload.name_ar,
    payload.hero_subtitle_ar,
    payload.hero_badge_ar,
    payload.offer_badge_ar,
    payload.offer_discount_text_ar,
    payload.offer_limited_text_ar,
    payload.cta_text_ar,
    payload.features_title_ar,
    payload.testimonials_title_ar,
    payload.media_caption_ar,
    payload.faq_title_ar,
    payload.contact_title_ar,
    payload.description_ar,
  ].map(trimText);

  if (requiredText.some((field) => field.length === 0)) {
    throw new Error("Please fill all required Arabic landing section fields.");
  }

  if (!trimText(payload.media_url)) {
    throw new Error("Primary media URL is required.");
  }

  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    throw new Error("Price must be greater than zero.");
  }

  if (
    payload.discount_price != null &&
    (!Number.isFinite(payload.discount_price) || payload.discount_price <= 0)
  ) {
    throw new Error("Discount price must be a valid positive number.");
  }

  if (trimList(payload.features_ar).length < 4) {
    throw new Error("Please provide at least 4 Arabic feature items.");
  }
  if (trimList(payload.testimonials_ar.map((t) => `${t.name} ${t.quote}`)).length < 4) {
    throw new Error("Please provide at least 4 Arabic testimonials.");
  }
  if (trimList(payload.faqs_ar.map((f) => `${f.q} ${f.a}`)).length < 4) {
    throw new Error("Please provide at least 4 Arabic FAQ items.");
  }
  if (trimList(payload.stats_ar).length < 3) {
    throw new Error("Please provide at least 3 Arabic stats items.");
  }
  if (trimList(payload.contact_lines_ar).length < 3) {
    throw new Error("Please provide at least 3 Arabic contact lines.");
  }
}

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
  validateProductPayload(payload);
  const supabase = await assertAdmin();

  const candidate = await allocateUniqueSlug(supabase, payload.name_ar);

  const { error } = await supabase.from("products").insert({
    default_language: payload.default_language,
    brand_color: normalizeHexColor(payload.brand_color, BRAND_COLOR),
    logo_url: payload.logo_url.trim(),
    name_ar: payload.name_ar.trim(),
    name_fr: payload.name_fr.trim(),
    hero_subtitle_ar: payload.hero_subtitle_ar,
    hero_subtitle_fr: payload.hero_subtitle_fr,
    hero_badge_ar: payload.hero_badge_ar,
    hero_badge_fr: payload.hero_badge_fr,
    header_offer_text_ar: payload.header_offer_text_ar,
    header_offer_text_fr: payload.header_offer_text_fr,
    header_discount_text_ar: payload.header_discount_text_ar,
    header_discount_text_fr: payload.header_discount_text_fr,
    header_promo_text_ar: payload.header_promo_text_ar,
    header_promo_text_fr: payload.header_promo_text_fr,
    header_announcement_text_ar: payload.header_announcement_text_ar,
    header_announcement_text_fr: payload.header_announcement_text_fr,
    header_cta_text_ar: payload.header_cta_text_ar,
    header_cta_text_fr: payload.header_cta_text_fr,
    offer_badge_ar: payload.offer_badge_ar,
    offer_badge_fr: payload.offer_badge_fr,
    offer_discount_text_ar: payload.offer_discount_text_ar,
    offer_discount_text_fr: payload.offer_discount_text_fr,
    offer_limited_text_ar: payload.offer_limited_text_ar,
    offer_limited_text_fr: payload.offer_limited_text_fr,
    description_ar: payload.description_ar,
    description_fr: payload.description_fr,
    cta_text_ar: payload.cta_text_ar,
    cta_text_fr: payload.cta_text_fr,
    features_title_ar: payload.features_title_ar,
    features_title_fr: payload.features_title_fr,
    testimonials_title_ar: payload.testimonials_title_ar,
    testimonials_title_fr: payload.testimonials_title_fr,
    media_caption_ar: payload.media_caption_ar,
    media_caption_fr: payload.media_caption_fr,
    faq_title_ar: payload.faq_title_ar,
    faq_title_fr: payload.faq_title_fr,
    stats_section_title_ar: payload.stats_section_title_ar.trim(),
    stats_section_title_fr: payload.stats_section_title_fr.trim(),
    testimonials_badge_ar: payload.testimonials_badge_ar.trim(),
    testimonials_badge_fr: payload.testimonials_badge_fr.trim(),
    footer_note_ar: payload.footer_note_ar.trim(),
    footer_note_fr: payload.footer_note_fr.trim(),
    cta_banner_background_color: normalizeOptionalHexColor(payload.cta_banner_background_color),
    cta_banner_background_image_url: payload.cta_banner_background_image_url.trim(),
    cta_banner_image_overlay: payload.cta_banner_image_overlay,
    contact_title_ar: payload.contact_title_ar,
    contact_title_fr: payload.contact_title_fr,
    whatsapp_message_template: payload.whatsapp_message_template?.trim() || null,
    slug: candidate,
    old_slugs: payload.old_slugs.filter(Boolean),
    price: payload.price,
    discount_price: payload.discount_price,
    media_type: payload.media_type,
    media_url: payload.media_url.trim(),
    secondary_media_type: payload.secondary_media_type,
    secondary_media_url: payload.secondary_media_url.trim(),
    tertiary_media_type: payload.tertiary_media_type,
    tertiary_media_url: payload.tertiary_media_url.trim(),
    features_ar: payload.features_ar,
    features_fr: payload.features_fr,
    gallery: payload.gallery,
    testimonials_ar: payload.testimonials_ar,
    testimonials_fr: payload.testimonials_fr,
    faqs_ar: payload.faqs_ar,
    faqs_fr: payload.faqs_fr,
    stats_ar: payload.stats_ar,
    stats_fr: payload.stats_fr,
    contact_lines_ar: payload.contact_lines_ar,
    contact_lines_fr: payload.contact_lines_fr,
    meta_pixel_id: payload.meta_pixel_id?.trim() || null,
    sticky_footer_offer_ends_at: payload.sticky_footer_offer_ends_at,
    sticky_footer_timer_label_ar: payload.sticky_footer_timer_label_ar,
    sticky_footer_timer_label_fr: payload.sticky_footer_timer_label_fr,
    sticky_footer_savings_badge_ar: payload.sticky_footer_savings_badge_ar,
    sticky_footer_savings_badge_fr: payload.sticky_footer_savings_badge_fr,
    sticky_footer_bar_bg_color: normalizeOptionalHexColor(payload.sticky_footer_bar_bg_color),
    sticky_footer_badge_bg_color: normalizeOptionalHexColor(payload.sticky_footer_badge_bg_color),
    sticky_footer_timer_box_bg_color: normalizeOptionalHexColor(payload.sticky_footer_timer_box_bg_color),
    sticky_footer_timer_digit_color: normalizeOptionalHexColor(payload.sticky_footer_timer_digit_color),
    sticky_footer_cta_bg_color: normalizeOptionalHexColor(payload.sticky_footer_cta_bg_color),
    sticky_footer_cta_text_color: normalizeOptionalHexColor(payload.sticky_footer_cta_text_color),
    sticky_footer_show_timer: payload.sticky_footer_show_timer,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/${candidate}`);
  revalidatePath("/admin/products");
}

export async function updateProductAction(id: string, payload: ProductPayload) {
  validateProductPayload(payload);
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
      brand_color: normalizeHexColor(payload.brand_color, BRAND_COLOR),
      logo_url: payload.logo_url.trim(),
      name_ar: payload.name_ar.trim(),
      name_fr: payload.name_fr.trim(),
      hero_subtitle_ar: payload.hero_subtitle_ar,
      hero_subtitle_fr: payload.hero_subtitle_fr,
      hero_badge_ar: payload.hero_badge_ar,
      hero_badge_fr: payload.hero_badge_fr,
      header_offer_text_ar: payload.header_offer_text_ar,
      header_offer_text_fr: payload.header_offer_text_fr,
      header_discount_text_ar: payload.header_discount_text_ar,
      header_discount_text_fr: payload.header_discount_text_fr,
      header_promo_text_ar: payload.header_promo_text_ar,
      header_promo_text_fr: payload.header_promo_text_fr,
      header_announcement_text_ar: payload.header_announcement_text_ar,
      header_announcement_text_fr: payload.header_announcement_text_fr,
      header_cta_text_ar: payload.header_cta_text_ar,
      header_cta_text_fr: payload.header_cta_text_fr,
      offer_badge_ar: payload.offer_badge_ar,
      offer_badge_fr: payload.offer_badge_fr,
      offer_discount_text_ar: payload.offer_discount_text_ar,
      offer_discount_text_fr: payload.offer_discount_text_fr,
      offer_limited_text_ar: payload.offer_limited_text_ar,
      offer_limited_text_fr: payload.offer_limited_text_fr,
      description_ar: payload.description_ar,
      description_fr: payload.description_fr,
      cta_text_ar: payload.cta_text_ar,
      cta_text_fr: payload.cta_text_fr,
      features_title_ar: payload.features_title_ar,
      features_title_fr: payload.features_title_fr,
      testimonials_title_ar: payload.testimonials_title_ar,
      testimonials_title_fr: payload.testimonials_title_fr,
      media_caption_ar: payload.media_caption_ar,
      media_caption_fr: payload.media_caption_fr,
      faq_title_ar: payload.faq_title_ar,
      faq_title_fr: payload.faq_title_fr,
      stats_section_title_ar: payload.stats_section_title_ar.trim(),
      stats_section_title_fr: payload.stats_section_title_fr.trim(),
      testimonials_badge_ar: payload.testimonials_badge_ar.trim(),
      testimonials_badge_fr: payload.testimonials_badge_fr.trim(),
      footer_note_ar: payload.footer_note_ar.trim(),
      footer_note_fr: payload.footer_note_fr.trim(),
      cta_banner_background_color: normalizeOptionalHexColor(payload.cta_banner_background_color),
      cta_banner_background_image_url: payload.cta_banner_background_image_url.trim(),
      cta_banner_image_overlay: payload.cta_banner_image_overlay,
      contact_title_ar: payload.contact_title_ar,
      contact_title_fr: payload.contact_title_fr,
      whatsapp_message_template: payload.whatsapp_message_template?.trim() || null,
      price: payload.price,
      discount_price: payload.discount_price,
      media_type: payload.media_type,
      media_url: payload.media_url.trim(),
      secondary_media_type: payload.secondary_media_type,
      secondary_media_url: payload.secondary_media_url.trim(),
      tertiary_media_type: payload.tertiary_media_type,
      tertiary_media_url: payload.tertiary_media_url.trim(),
      features_ar: payload.features_ar,
      features_fr: payload.features_fr,
      gallery: payload.gallery,
      testimonials_ar: payload.testimonials_ar,
      testimonials_fr: payload.testimonials_fr,
      faqs_ar: payload.faqs_ar,
      faqs_fr: payload.faqs_fr,
      stats_ar: payload.stats_ar,
      stats_fr: payload.stats_fr,
      contact_lines_ar: payload.contact_lines_ar,
      contact_lines_fr: payload.contact_lines_fr,
      meta_pixel_id: payload.meta_pixel_id?.trim() || null,
      old_slugs: payload.old_slugs.filter(Boolean),
      sticky_footer_offer_ends_at: payload.sticky_footer_offer_ends_at,
      sticky_footer_timer_label_ar: payload.sticky_footer_timer_label_ar,
      sticky_footer_timer_label_fr: payload.sticky_footer_timer_label_fr,
      sticky_footer_savings_badge_ar: payload.sticky_footer_savings_badge_ar,
      sticky_footer_savings_badge_fr: payload.sticky_footer_savings_badge_fr,
      sticky_footer_bar_bg_color: normalizeOptionalHexColor(payload.sticky_footer_bar_bg_color),
      sticky_footer_badge_bg_color: normalizeOptionalHexColor(payload.sticky_footer_badge_bg_color),
      sticky_footer_timer_box_bg_color: normalizeOptionalHexColor(payload.sticky_footer_timer_box_bg_color),
      sticky_footer_timer_digit_color: normalizeOptionalHexColor(payload.sticky_footer_timer_digit_color),
      sticky_footer_cta_bg_color: normalizeOptionalHexColor(payload.sticky_footer_cta_bg_color),
      sticky_footer_cta_text_color: normalizeOptionalHexColor(payload.sticky_footer_cta_text_color),
      sticky_footer_show_timer: payload.sticky_footer_show_timer,
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
