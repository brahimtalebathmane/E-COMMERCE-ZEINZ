export type Testimonial = {
  name: string;
  quote: string;
  role?: string;
  image?: string;
  rating?: number;
  location?: string;
};

export type FAQ = {
  q: string;
  a: string;
};

export type ProductTestingStatus =
  | "under_research"
  | "ready_for_test"
  | "testing"
  | "winner"
  | "failed";

export type ProductSourcingType = "local" | "import";

export type ProductRow = {
  id: string;
  /** Default storefront language for this landing page. */
  default_language: "ar" | "fr";
  brand_color: string;
  logo_url: string;
  name_ar: string;
  name_fr: string;
  hero_subtitle_ar: string;
  hero_subtitle_fr: string;
  /** Primary landing header promo line; FR optional (falls back to AR). Legacy columns are fallback when empty. */
  header_bar_text_ar: string;
  header_bar_text_fr: string;
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
  /** 0 = unlimited wrapped lines; 1–12 = CSS line-clamp. */
  header_bar_max_lines: number;
  /** Optional promo strip font size (px); null uses responsive defaults on the landing header. */
  header_bar_font_size_px: number | null;
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
  /** Stats band heading (optional; landing uses defaults when empty). */
  stats_section_title_ar: string;
  stats_section_title_fr: string;
  /** Pill line under testimonials title (optional). */
  testimonials_badge_ar: string;
  testimonials_badge_fr: string;
  /** Footer copyright / note line (optional). */
  footer_note_ar: string;
  footer_note_fr: string;
  /** Solid banner fill (hex). Empty = theme gradient when no image. */
  cta_banner_background_color: string;
  cta_banner_background_image_url: string;
  /** 0–1 darkness overlay when a banner image is set. */
  cta_banner_image_overlay: number;
  /** Sticky footer countdown target (UTC). Null = no countdown / hide timer segment when disabled. */
  sticky_footer_offer_ends_at: string | null;
  sticky_footer_timer_label_ar: string;
  sticky_footer_timer_label_fr: string;
  /** Optional; empty = derive from price − discount when discounted. */
  sticky_footer_savings_badge_ar: string;
  sticky_footer_savings_badge_fr: string;
  sticky_footer_bar_bg_color: string;
  sticky_footer_badge_bg_color: string;
  sticky_footer_timer_box_bg_color: string;
  sticky_footer_timer_digit_color: string;
  sticky_footer_cta_bg_color: string;
  sticky_footer_cta_text_color: string;
  sticky_footer_show_timer: boolean;
  contact_title_ar: string;
  contact_title_fr: string;
  whatsapp_message_template: string | null;
  slug: string;
  old_slugs: string[];
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
  /** LEGACY — not used for Meta event routing (unified env pixel only). */
  meta_pixel_id: string | null;
  test_status: ProductTestingStatus;
  sourcing_type: ProductSourcingType | null;
  sourcing_link: string;
  cost_price: number | null;
  /** Optional inclusive cutoff for profit analytics (YYYY-MM-DD). Null = life-to-date. */
  profit_calculation_start_date: string | null;
  created_at: string;
};

/**
 * Landing sections that may be empty while `test_status === 'under_research'`.
 * Populated when completing landing setup.
 */
export type ProductLandingContentFields = {
  description_ar?: string;
  description_fr?: string;
  hero_subtitle_ar?: string;
  features_ar?: string[];
  features_fr?: string[];
  testimonials_ar?: Testimonial[];
  testimonials_fr?: Testimonial[];
  faqs_ar?: FAQ[];
  faqs_fr?: FAQ[];
  stats_ar?: string[];
  stats_fr?: string[];
  contact_lines_ar?: string[];
  contact_lines_fr?: string[];
  gallery?: string[];
};

/** Resolved strings for the current storefront locale (Arabic or French with Arabic fallback). */
export type LocalizedProductCopy = {
  brandColor: string;
  logoUrl: string;
  name: string;
  heroSubtitle: string;
  headerBarText: string;
  headerCtaText: string;
  ctaText: string;
  featuresTitle: string;
  testimonialsTitle: string;
  mediaCaption: string;
  faqTitle: string;
  statsSectionTitle: string;
  testimonialsBadge: string;
  footerNote: string;
  contactTitle: string;
  description: string;
  features: string[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  stats: string[];
  contactLines: string[];
};

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "cancelled"
  | "requires_human_intervention"
  | "internal_return";

export type OrderRow = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  total_price: number;
  status: OrderStatus;
  completion_token: string;
  created_at: string;
  /** Set when soft-deleted from admin; row is retained for auditing. */
  deleted_at?: string | null;
};

export type OrderStatusHistoryRow = {
  id: string;
  order_id: string;
  old_status: OrderStatus;
  new_status: OrderStatus;
  changed_by: string | null;
  created_at: string;
};

export type PaymentMethodRow = {
  id: string;
  label: string;
  account_number: string;
  payment_logo_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};
