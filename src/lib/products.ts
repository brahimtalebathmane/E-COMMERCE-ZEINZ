import type { ProductRow, ProductSourcingType, ProductTestingStatus } from "@/types";

const TEST_STATUSES: ProductTestingStatus[] = [
  "under_research",
  "ready_for_test",
  "testing",
  "winner",
  "failed",
];

function parseTestStatus(raw: unknown): ProductTestingStatus {
  if (typeof raw === "string" && (TEST_STATUSES as string[]).includes(raw)) {
    return raw as ProductTestingStatus;
  }
  return "under_research";
}

function parseSourcingType(raw: unknown): ProductSourcingType | null {
  if (raw === "local" || raw === "import") return raw;
  return null;
}
import { extractMetaPixelIdFromRow, normalizeMetaPixelId } from "@/lib/meta-pixel-id";
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
    brand_color: (row.brand_color as string) ?? "#006B0C",
    logo_url: (row.logo_url as string) ?? "",
    name_ar: row.name_ar as string,
    name_fr: (row.name_fr as string) ?? "",
    hero_subtitle_ar: (row.hero_subtitle_ar as string) ?? "",
    hero_subtitle_fr: (row.hero_subtitle_fr as string) ?? "",
    header_bar_text_ar: (row.header_bar_text_ar as string) ?? "",
    header_bar_text_fr: (row.header_bar_text_fr as string) ?? "",
    header_offer_text_ar: (row.header_offer_text_ar as string) ?? "",
    header_offer_text_fr: (row.header_offer_text_fr as string) ?? "",
    header_discount_text_ar: (row.header_discount_text_ar as string) ?? "",
    header_discount_text_fr: (row.header_discount_text_fr as string) ?? "",
    header_promo_text_ar: (row.header_promo_text_ar as string) ?? "",
    header_promo_text_fr: (row.header_promo_text_fr as string) ?? "",
    header_announcement_text_ar: (row.header_announcement_text_ar as string) ?? "",
    header_announcement_text_fr: (row.header_announcement_text_fr as string) ?? "",
    header_cta_text_ar: (row.header_cta_text_ar as string) ?? "",
    header_cta_text_fr: (row.header_cta_text_fr as string) ?? "",
    header_bar_max_lines: (() => {
      const v = row.header_bar_max_lines;
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.min(12, Math.max(0, Math.round(n)));
    })(),
    header_bar_font_size_px: (() => {
      const v = row.header_bar_font_size_px;
      if (v === null || v === undefined) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.min(24, Math.max(10, Math.round(n)));
    })(),
    description_ar: (row.description_ar as string) ?? "",
    description_fr: (row.description_fr as string) ?? "",
    cta_text_ar: (row.cta_text_ar as string) ?? "",
    cta_text_fr: (row.cta_text_fr as string) ?? "",
    features_title_ar: (row.features_title_ar as string) ?? "",
    features_title_fr: (row.features_title_fr as string) ?? "",
    testimonials_title_ar: (row.testimonials_title_ar as string) ?? "",
    testimonials_title_fr: (row.testimonials_title_fr as string) ?? "",
    media_caption_ar: (row.media_caption_ar as string) ?? "",
    media_caption_fr: (row.media_caption_fr as string) ?? "",
    faq_title_ar: (row.faq_title_ar as string) ?? "",
    faq_title_fr: (row.faq_title_fr as string) ?? "",
    stats_section_title_ar: (row.stats_section_title_ar as string) ?? "",
    stats_section_title_fr: (row.stats_section_title_fr as string) ?? "",
    testimonials_badge_ar: (row.testimonials_badge_ar as string) ?? "",
    testimonials_badge_fr: (row.testimonials_badge_fr as string) ?? "",
    footer_note_ar: (row.footer_note_ar as string) ?? "",
    footer_note_fr: (row.footer_note_fr as string) ?? "",
    cta_banner_background_color: (row.cta_banner_background_color as string) ?? "",
    cta_banner_background_image_url: (row.cta_banner_background_image_url as string) ?? "",
    cta_banner_image_overlay:
      row.cta_banner_image_overlay === null || row.cta_banner_image_overlay === undefined
        ? 0.45
        : Number(row.cta_banner_image_overlay),
    sticky_footer_offer_ends_at:
      row.sticky_footer_offer_ends_at != null
        ? String(row.sticky_footer_offer_ends_at)
        : null,
    sticky_footer_timer_label_ar: (row.sticky_footer_timer_label_ar as string) ?? "",
    sticky_footer_timer_label_fr: (row.sticky_footer_timer_label_fr as string) ?? "",
    sticky_footer_savings_badge_ar: (row.sticky_footer_savings_badge_ar as string) ?? "",
    sticky_footer_savings_badge_fr: (row.sticky_footer_savings_badge_fr as string) ?? "",
    sticky_footer_bar_bg_color: (row.sticky_footer_bar_bg_color as string) ?? "",
    sticky_footer_badge_bg_color: (row.sticky_footer_badge_bg_color as string) ?? "",
    sticky_footer_timer_box_bg_color: (row.sticky_footer_timer_box_bg_color as string) ?? "",
    sticky_footer_timer_digit_color: (row.sticky_footer_timer_digit_color as string) ?? "",
    sticky_footer_cta_bg_color: (row.sticky_footer_cta_bg_color as string) ?? "",
    sticky_footer_cta_text_color: (row.sticky_footer_cta_text_color as string) ?? "",
    sticky_footer_show_timer:
      row.sticky_footer_show_timer === null || row.sticky_footer_show_timer === undefined
        ? true
        : Boolean(row.sticky_footer_show_timer),
    contact_title_ar: (row.contact_title_ar as string) ?? "",
    contact_title_fr: (row.contact_title_fr as string) ?? "",
    whatsapp_message_template:
      (row.whatsapp_message_template as string | null | undefined) ?? null,
    slug: row.slug as string,
    old_slugs: (row.old_slugs as string[]) ?? [],
    price: Number(row.price),
    discount_price:
      row.discount_price === null || row.discount_price === undefined
        ? null
        : Number(row.discount_price),
    media_type: row.media_type as "image" | "video",
    media_url: row.media_url as string,
    secondary_media_type: (row.secondary_media_type as "image" | "video") ?? "image",
    secondary_media_url: (row.secondary_media_url as string) ?? "",
    tertiary_media_type: (row.tertiary_media_type as "image" | "video") ?? "image",
    tertiary_media_url: (row.tertiary_media_url as string) ?? "",
    features_ar: (row.features_ar as string[]) ?? [],
    features_fr: (row.features_fr as string[]) ?? [],
    gallery: (row.gallery as string[]) ?? [],
    testimonials_ar: (row.testimonials_ar as ProductRow["testimonials_ar"]) ?? [],
    testimonials_fr: (row.testimonials_fr as ProductRow["testimonials_fr"]) ?? [],
    faqs_ar: (row.faqs_ar as ProductRow["faqs_ar"]) ?? [],
    faqs_fr: (row.faqs_fr as ProductRow["faqs_fr"]) ?? [],
    stats_ar: (row.stats_ar as string[]) ?? [],
    stats_fr: (row.stats_fr as string[]) ?? [],
    contact_lines_ar: (row.contact_lines_ar as string[]) ?? [],
    contact_lines_fr: (row.contact_lines_fr as string[]) ?? [],
    meta_pixel_id: normalizeMetaPixelId(extractMetaPixelIdFromRow(row)),
    test_status: parseTestStatus(row.test_status),
    sourcing_type: parseSourcingType(row.sourcing_type),
    sourcing_link: (row.sourcing_link as string) ?? "",
    cost_price:
      row.cost_price === null || row.cost_price === undefined
        ? null
        : Number(row.cost_price),
    profit_calculation_start_date:
      row.profit_calculation_start_date == null
        ? null
        : String(row.profit_calculation_start_date).slice(0, 10),
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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
  const { data, error } = await supabase
    .from("products")
    .select("slug")
    .is("deleted_at", null);

  if (error || !data) return [];
  return data.map((r) => ({ slug: (r as { slug: string }).slug }));
}
