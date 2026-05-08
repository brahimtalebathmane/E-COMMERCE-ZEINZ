import type {
  FAQ,
  LocalizedProductCopy,
  ProductRow,
  Testimonial,
} from "@/types";
import type { Locale } from "@/lib/i18n";
import { BRAND_COLOR, SITE_LOGO_URL } from "@/lib/site-branding";

function pickStr(locale: Locale, ar: string, fr: string): string {
  if (locale !== "fr") return ar;
  const t = fr.trim();
  return t.length > 0 ? fr : ar;
}

function pickFeatures(
  locale: Locale,
  ar: string[],
  fr: string[],
): string[] {
  if (locale !== "fr") return ar;
  if (!fr.length) return ar;
  return ar.map((a, i) => {
    const f = fr[i]?.trim() ?? "";
    return f.length > 0 ? (fr[i] as string) : a;
  });
}

function pickTestimonials(
  locale: Locale,
  ar: Testimonial[],
  fr: Testimonial[],
): Testimonial[] {
  if (locale !== "fr") return ar;
  if (!fr.length) return ar;
  return ar.map((a, i) => {
    const f = fr[i];
    if (!f) return a;
    const name = f.name.trim() || a.name;
    const quote = f.quote.trim() || a.quote;
    const roleMerged = pickStr(locale, a.role ?? "", f.role ?? "").trim();
    const base: Testimonial = { name, quote };
    if (roleMerged) return { ...base, role: roleMerged };
    return base;
  });
}

function pickFaqs(locale: Locale, ar: FAQ[], fr: FAQ[]): FAQ[] {
  if (locale !== "fr") return ar;
  if (!fr.length) return ar;
  return ar.map((a, i) => {
    const f = fr[i];
    if (!f) return a;
    return {
      q: f.q.trim() || a.q,
      a: f.a.trim() || a.a,
    };
  });
}

export function getLocalizedProductCopy(
  locale: Locale,
  p: ProductRow,
): LocalizedProductCopy {
  return {
    brandColor: p.brand_color?.trim() || BRAND_COLOR,
    logoUrl: p.logo_url?.trim() || SITE_LOGO_URL,
    name: pickStr(locale, p.name_ar, p.name_fr),
    heroSubtitle: pickStr(locale, p.hero_subtitle_ar, p.hero_subtitle_fr),
    heroBadge: pickStr(locale, p.hero_badge_ar, p.hero_badge_fr),
    ctaText: pickStr(locale, p.cta_text_ar, p.cta_text_fr),
    featuresTitle: pickStr(locale, p.features_title_ar, p.features_title_fr),
    testimonialsTitle: pickStr(
      locale,
      p.testimonials_title_ar,
      p.testimonials_title_fr,
    ),
    mediaCaption: pickStr(locale, p.media_caption_ar, p.media_caption_fr),
    faqTitle: pickStr(locale, p.faq_title_ar, p.faq_title_fr),
    contactTitle: pickStr(locale, p.contact_title_ar, p.contact_title_fr),
    description: pickStr(locale, p.description_ar, p.description_fr),
    features: pickFeatures(locale, p.features_ar, p.features_fr),
    testimonials: pickTestimonials(
      locale,
      p.testimonials_ar,
      p.testimonials_fr,
    ),
    faqs: pickFaqs(locale, p.faqs_ar, p.faqs_fr),
    stats: pickFeatures(locale, p.stats_ar, p.stats_fr),
    contactLines: pickFeatures(
      locale,
      p.contact_lines_ar,
      p.contact_lines_fr,
    ),
  };
}
