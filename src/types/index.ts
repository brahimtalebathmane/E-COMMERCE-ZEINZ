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
  hero_badge_ar: string;
  hero_badge_fr: string;
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
  /** Solid banner fill (hex). Empty = theme gradient when no image. */
  cta_banner_background_color: string;
  cta_banner_background_image_url: string;
  /** 0–1 darkness overlay when a banner image is set. */
  cta_banner_image_overlay: number;
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
  meta_pixel_id: string | null;
  created_at: string;
};

/** Resolved strings for the current storefront locale (Arabic or French with Arabic fallback). */
export type LocalizedProductCopy = {
  brandColor: string;
  logoUrl: string;
  name: string;
  heroSubtitle: string;
  heroBadge: string;
  headerOfferText: string;
  headerDiscountText: string;
  headerPromoText: string;
  headerAnnouncementText: string;
  headerCtaText: string;
  offerBadgeText: string;
  offerDiscountText: string;
  offerLimitedText: string;
  ctaText: string;
  featuresTitle: string;
  testimonialsTitle: string;
  mediaCaption: string;
  faqTitle: string;
  contactTitle: string;
  description: string;
  features: string[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  stats: string[];
  contactLines: string[];
};

export type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled";

export type OrderRow = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  total_price: number;
  status: OrderStatus;
  completion_token: string;
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
