import type {
  FAQ,
  FormFieldConfig,
  LocalizedProductCopy,
  ProductRow,
  Testimonial,
} from "@/types";
import type { Locale } from "@/lib/i18n";

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

function pickFormFields(
  locale: Locale,
  ar: FormFieldConfig[],
  fr: FormFieldConfig[],
): FormFieldConfig[] {
  if (locale !== "fr") return ar;
  if (!fr.length) return ar;
  const frById = new Map(fr.map((x) => [x.id, x]));
  return ar.map((a) => {
    const f = frById.get(a.id);
    const label = f?.label != null ? pickStr(locale, a.label, f.label) : a.label;
    return { ...a, label };
  });
}

export function getLocalizedProductCopy(
  locale: Locale,
  p: ProductRow,
): LocalizedProductCopy {
  return {
    name: pickStr(locale, p.name_ar, p.name_fr),
    description: pickStr(locale, p.description_ar, p.description_fr),
    features: pickFeatures(locale, p.features_ar, p.features_fr),
    testimonials: pickTestimonials(
      locale,
      p.testimonials_ar,
      p.testimonials_fr,
    ),
    faqs: pickFaqs(locale, p.faqs_ar, p.faqs_fr),
    form_title: pickStr(locale, p.form_title_ar, p.form_title_fr),
    form_fields: pickFormFields(locale, p.form_fields_ar, p.form_fields_fr),
  };
}
