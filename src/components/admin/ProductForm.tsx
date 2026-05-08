"use client";

import type { ProductRow, Testimonial, FAQ } from "@/types";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
  type ProductPayload,
} from "@/app/admin/(dashboard)/products/actions";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function moveAt<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  const x = next[i];
  const y = next[j];
  if (x === undefined || y === undefined) return arr;
  next[i] = y;
  next[j] = x;
  return next;
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type FeatureRow = { ar: string; fr: string };

type TestimonialDraft = {
  id: string;
  name_ar: string;
  name_fr: string;
  quote_ar: string;
  quote_fr: string;
  role_ar: string;
  role_fr: string;
};

type FaqDraft = {
  id: string;
  q_ar: string;
  q_fr: string;
  a_ar: string;
  a_fr: string;
};

function GalleryUrlRow({
  url,
  onChange,
  onRemove,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  url: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const trimmed = url.trim();
  useEffect(() => {
    setBroken(false);
  }, [trimmed]);

  return (
    <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="url"
            className="w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder={a.productForm.galleryUrlPlaceholder}
            dir="ltr"
            autoComplete="off"
          />
          {trimmed ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--muted)]">{a.productForm.galleryPreview}</span>
              {broken ? (
                <div
                  className="h-16 w-16 shrink-0 rounded-lg border border-dashed border-[var(--accent-muted)] bg-[var(--accent-muted)]/30"
                  aria-hidden
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- external gallery URLs from admin
                <img
                  src={trimmed}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-[var(--accent-muted)] object-cover"
                  onError={() => setBroken(true)}
                />
              )}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <button
            type="button"
            className="rounded-lg border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            {a.productForm.moveUp}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            {a.productForm.moveDown}
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
            onClick={onRemove}
          >
            {a.productForm.removeItem}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  mode: "create" | "edit";
  initial?: ProductRow;
};

function buildInitialFeatures(initial?: ProductRow): FeatureRow[] {
  const ar = initial?.features_ar ?? [];
  const fr = initial?.features_fr ?? [];
  const n = Math.max(ar.length, fr.length, 0);
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) => ({
    ar: ar[i] ?? "",
    fr: fr[i] ?? "",
  }));
}

const LANDING_SECTION_MAP = [
  { id: "hero", title: "Hero", fields: "name_* + hero_subtitle_* + hero_badge_* + media_* + price/discount + cta_text_*" },
  { id: "features", title: "Features", fields: "features_title_* + features_ar/fr[]" },
  { id: "media-secondary", title: "Secondary Media", fields: "secondary_media_type + secondary_media_url" },
  { id: "testimonials", title: "Testimonials", fields: "testimonials_title_* + testimonials_ar/fr[]" },
  { id: "stats", title: "Stats Bar", fields: "stats_ar/fr[]" },
  { id: "media-caption", title: "Caption Block", fields: "media_caption_* + description_* (extra lines)" },
  { id: "media-tertiary", title: "Tertiary Media", fields: "tertiary_media_type + tertiary_media_url" },
  { id: "faq", title: "FAQ", fields: "faq_title_* + faqs_ar/fr[]" },
  { id: "contact", title: "Contact", fields: "contact_title_* + contact_lines_ar/fr[]" },
] as const;

export function ProductForm({ mode, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [defaultLanguage, setDefaultLanguage] = useState<"ar" | "fr">(
    initial?.default_language ?? "ar",
  );
  const [nameAr, setNameAr] = useState(initial?.name_ar ?? "");
  const [nameFr, setNameFr] = useState(initial?.name_fr ?? "");
  const [heroSubtitleAr, setHeroSubtitleAr] = useState(initial?.hero_subtitle_ar ?? "");
  const [heroSubtitleFr, setHeroSubtitleFr] = useState(initial?.hero_subtitle_fr ?? "");
  const [heroBadgeAr, setHeroBadgeAr] = useState(initial?.hero_badge_ar ?? "");
  const [heroBadgeFr, setHeroBadgeFr] = useState(initial?.hero_badge_fr ?? "");
  const [descriptionAr, setDescriptionAr] = useState(initial?.description_ar ?? "");
  const [descriptionFr, setDescriptionFr] = useState(initial?.description_fr ?? "");
  const [ctaTextAr, setCtaTextAr] = useState(initial?.cta_text_ar ?? "");
  const [ctaTextFr, setCtaTextFr] = useState(initial?.cta_text_fr ?? "");
  const [featuresTitleAr, setFeaturesTitleAr] = useState(initial?.features_title_ar ?? "");
  const [featuresTitleFr, setFeaturesTitleFr] = useState(initial?.features_title_fr ?? "");
  const [testimonialsTitleAr, setTestimonialsTitleAr] = useState(
    initial?.testimonials_title_ar ?? "",
  );
  const [testimonialsTitleFr, setTestimonialsTitleFr] = useState(
    initial?.testimonials_title_fr ?? "",
  );
  const [mediaCaptionAr, setMediaCaptionAr] = useState(initial?.media_caption_ar ?? "");
  const [mediaCaptionFr, setMediaCaptionFr] = useState(initial?.media_caption_fr ?? "");
  const [faqTitleAr, setFaqTitleAr] = useState(initial?.faq_title_ar ?? "");
  const [faqTitleFr, setFaqTitleFr] = useState(initial?.faq_title_fr ?? "");
  const [contactTitleAr, setContactTitleAr] = useState(initial?.contact_title_ar ?? "");
  const [contactTitleFr, setContactTitleFr] = useState(initial?.contact_title_fr ?? "");
  const [statsArText, setStatsArText] = useState((initial?.stats_ar ?? []).join("\n"));
  const [statsFrText, setStatsFrText] = useState((initial?.stats_fr ?? []).join("\n"));
  const [contactArText, setContactArText] = useState(
    (initial?.contact_lines_ar ?? []).join("\n"),
  );
  const [contactFrText, setContactFrText] = useState(
    (initial?.contact_lines_fr ?? []).join("\n"),
  );
  const [whatsAppTemplate, setWhatsAppTemplate] = useState(
    initial?.whatsapp_message_template ?? "",
  );
  const [price, setPrice] = useState(String(initial?.price ?? "0"));
  const [discount, setDiscount] = useState(
    initial?.discount_price != null ? String(initial.discount_price) : "",
  );
  const [mediaType, setMediaType] = useState<"image" | "video">(
    initial?.media_type ?? "image",
  );
  const [mediaUrl, setMediaUrl] = useState(initial?.media_url ?? "");
  const [secondaryMediaType, setSecondaryMediaType] = useState<"image" | "video">(
    initial?.secondary_media_type ?? "image",
  );
  const [secondaryMediaUrl, setSecondaryMediaUrl] = useState(initial?.secondary_media_url ?? "");
  const [tertiaryMediaType, setTertiaryMediaType] = useState<"image" | "video">(
    initial?.tertiary_media_type ?? "image",
  );
  const [tertiaryMediaUrl, setTertiaryMediaUrl] = useState(initial?.tertiary_media_url ?? "");
  const [featureRows, setFeatureRows] = useState<FeatureRow[]>(() =>
    buildInitialFeatures(initial),
  );
  const [gallery, setGallery] = useState<{ id: string; url: string }[]>(() =>
    initial?.gallery?.length
      ? initial.gallery.map((url, i) => ({ id: `gallery-init-${i}`, url }))
      : [],
  );
  const [testimonials, setTestimonials] = useState<TestimonialDraft[]>(() =>
    initial?.testimonials_ar?.length
      ? initial.testimonials_ar.map((t, i) => ({
          id: `testimonial-init-${i}`,
          name_ar: t.name,
          name_fr: initial.testimonials_fr[i]?.name ?? "",
          quote_ar: t.quote,
          quote_fr: initial.testimonials_fr[i]?.quote ?? "",
          role_ar: t.role ?? "",
          role_fr: initial.testimonials_fr[i]?.role ?? "",
        }))
      : [],
  );
  const [faqs, setFaqs] = useState<FaqDraft[]>(() =>
    initial?.faqs_ar?.length
      ? initial.faqs_ar.map((f, i) => ({
          id: `faq-init-${i}`,
          q_ar: f.q,
          q_fr: initial.faqs_fr[i]?.q ?? "",
          a_ar: f.a,
          a_fr: initial.faqs_fr[i]?.a ?? "",
        }))
      : [],
  );
  const [metaPixel, setMetaPixel] = useState(initial?.meta_pixel_id ?? "");
  const [oldSlugs, setOldSlugs] = useState<string[]>(() =>
    initial?.old_slugs?.length ? [...initial.old_slugs] : [],
  );

  function buildPayload(): ProductPayload {
    const discountPrice =
      discount.trim() === "" ? null : Number.parseFloat(discount);

    const keptFeatures = featureRows.filter((r) => r.ar.trim());
    const features_ar = keptFeatures.map((r) => r.ar.trim());
    const features_fr = keptFeatures.map((r) => r.fr.trim());

    const testimonialPairs = testimonials.filter(
      (t) => t.name_ar.trim() && t.quote_ar.trim(),
    );
    const cleanedTestimonialsAr: Testimonial[] = testimonialPairs.map((t) => {
      const base: Testimonial = {
        name: t.name_ar.trim(),
        quote: t.quote_ar.trim(),
      };
      const role = t.role_ar.trim();
      if (role) return { ...base, role };
      return base;
    });
    const cleanedTestimonialsFr: Testimonial[] = testimonialPairs.map((t) => {
      const base: Testimonial = {
        name: t.name_fr.trim(),
        quote: t.quote_fr.trim(),
      };
      const role = t.role_fr.trim();
      if (role) return { ...base, role };
      return base;
    });

    const faqPairs = faqs.filter((f) => f.q_ar.trim() && f.a_ar.trim());
    const cleanedFaqsAr: FAQ[] = faqPairs.map((f) => ({
      q: f.q_ar.trim(),
      a: f.a_ar.trim(),
    }));
    const cleanedFaqsFr: FAQ[] = faqPairs.map((f) => ({
      q: f.q_fr.trim(),
      a: f.a_fr.trim(),
    }));

    return {
      default_language: defaultLanguage,
      name_ar: nameAr.trim(),
      name_fr: nameFr,
      hero_subtitle_ar: heroSubtitleAr.trim(),
      hero_subtitle_fr: heroSubtitleFr,
      hero_badge_ar: heroBadgeAr.trim(),
      hero_badge_fr: heroBadgeFr,
      description_ar: descriptionAr.trim(),
      description_fr: descriptionFr,
      cta_text_ar: ctaTextAr.trim(),
      cta_text_fr: ctaTextFr,
      features_title_ar: featuresTitleAr.trim(),
      features_title_fr: featuresTitleFr,
      testimonials_title_ar: testimonialsTitleAr.trim(),
      testimonials_title_fr: testimonialsTitleFr,
      media_caption_ar: mediaCaptionAr.trim(),
      media_caption_fr: mediaCaptionFr,
      faq_title_ar: faqTitleAr.trim(),
      faq_title_fr: faqTitleFr,
      contact_title_ar: contactTitleAr.trim(),
      contact_title_fr: contactTitleFr,
      whatsapp_message_template: whatsAppTemplate.trim() || null,
      price: Number.parseFloat(price),
      discount_price:
        discountPrice != null && !Number.isNaN(discountPrice)
          ? discountPrice
          : null,
      media_type: mediaType,
      media_url: mediaUrl,
      secondary_media_type: secondaryMediaType,
      secondary_media_url: secondaryMediaUrl,
      tertiary_media_type: tertiaryMediaType,
      tertiary_media_url: tertiaryMediaUrl,
      features_ar,
      features_fr,
      gallery: gallery.map((g) => g.url.trim()).filter(Boolean),
      testimonials_ar: cleanedTestimonialsAr,
      testimonials_fr: cleanedTestimonialsFr,
      faqs_ar: cleanedFaqsAr,
      faqs_fr: cleanedFaqsFr,
      stats_ar: statsArText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      stats_fr: statsFrText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      contact_lines_ar: contactArText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      contact_lines_fr: contactFrText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      meta_pixel_id: metaPixel.trim() || null,
      old_slugs: oldSlugs.map((s) => s.trim()).filter(Boolean),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (payload.features_ar.length < 4) {
        throw new Error("الرجاء إدخال 4 مميزات عربية على الأقل.");
      }
      if (payload.testimonials_ar.length < 4) {
        throw new Error("الرجاء إدخال 4 شهادات عربية على الأقل.");
      }
      if (payload.faqs_ar.length < 4) {
        throw new Error("الرجاء إدخال 4 أسئلة شائعة عربية على الأقل.");
      }
      if (payload.stats_ar.length < 3) {
        throw new Error("الرجاء إدخال 3 أسطر على الأقل في إحصائيات الشريط.");
      }
      if (payload.contact_lines_ar.length < 3) {
        throw new Error("الرجاء إدخال 3 أسطر على الأقل في قسم التواصل.");
      }
      if (mode === "create") {
        await createProductAction(payload);
      } else if (initial) {
        await updateProductAction(initial.id, payload);
      }
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : a.productForm.failedSave);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!initial || mode !== "edit") return;
    if (!confirm(a.productForm.deleteConfirm)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteProductAction(initial.id);
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : a.productForm.failedDelete);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8 text-start" dir="rtl">
      <section className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">خريطة ربط أقسام الهبوط (Admin → Landing)</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          ترتيب العرض ثابت كما هو في الصفحة، وكل سطر يوضح الحقول التي تتحكم مباشرة في القسم المقابل.
        </p>
        <div className="mt-3 space-y-2 text-xs">
          {LANDING_SECTION_MAP.map((s, i) => (
            <div key={s.id} className="rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-2">
              <p className="font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 font-mono text-[var(--muted)]" dir="ltr">
                {s.fields}
              </p>
            </div>
          ))}
        </div>
      </section>

      {mode === "edit" && initial ? (
        <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 text-sm">
          <p>
            <span className="text-[var(--muted)]">{a.productForm.slugFixed}</span>{" "}
            <code className="font-mono" dir="ltr">
              {initial.slug}
            </code>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.defaultLanguage}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.defaultLanguageHint}</p>
          <select
            className="mt-2 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value as "ar" | "fr")}
          >
            <option value="ar">{a.productForm.defaultLanguageArabic}</option>
            <option value="fr">{a.productForm.defaultLanguageFrench}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">
            {a.productForm.name} — {a.productForm.langArabic}
          </label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            {a.productForm.name} — {a.productForm.langFrench}
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            {a.productForm.description} — {a.productForm.langArabic}
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي: السطر الأول يُستخدم كوصف أساسي في الهبوط.</p>
          <textarea
            required
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            {a.productForm.description} — {a.productForm.langFrench}
          </label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={descriptionFr}
            onChange={(e) => setDescriptionFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            العنوان الفرعي أعلى الصفحة — {a.productForm.langArabic}
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={heroSubtitleAr}
            onChange={(e) => setHeroSubtitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Hero subtitle — {a.productForm.langFrench}
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={heroSubtitleFr}
            onChange={(e) => setHeroSubtitleFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">شارة أعلى الصفحة — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={heroBadgeAr}
            onChange={(e) => setHeroBadgeAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Hero badge — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={heroBadgeFr}
            onChange={(e) => setHeroBadgeFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">نص زر الشراء — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={ctaTextAr}
            onChange={(e) => setCtaTextAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">CTA text — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={ctaTextFr}
            onChange={(e) => setCtaTextFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان قسم المميزات — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={featuresTitleAr}
            onChange={(e) => setFeaturesTitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Features title — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={featuresTitleFr}
            onChange={(e) => setFeaturesTitleFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            إحصائيات الشريط الأخضر (سطر لكل عنصر) — {a.productForm.langArabic}
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">حد أدنى 3 أسطر</p>
          <textarea
            required
            rows={3}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={statsArText}
            onChange={(e) => setStatsArText(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Green stats bar (one line per item) — {a.productForm.langFrench}
          </label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={statsFrText}
            onChange={(e) => setStatsFrText(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            وسائل التواصل (سطر لكل عنصر) — {a.productForm.langArabic}
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">حد أدنى 3 أسطر</p>
          <textarea
            required
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={contactArText}
            onChange={(e) => setContactArText(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Contact lines (one line per item) — {a.productForm.langFrench}
          </label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={contactFrText}
            onChange={(e) => setContactFrText(e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{a.productForm.price}</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={a.productForm.pricePlaceholder}
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{a.productForm.discount}</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder={a.productForm.discountPlaceholder}
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{a.productForm.mediaType}</label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as "image" | "video")}
          >
            <option value="image">{a.productForm.mediaImage}</option>
            <option value="video">{a.productForm.mediaVideo}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{a.productForm.mediaUrl}</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">الوسيط الثاني: النوع</label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={secondaryMediaType}
            onChange={(e) => setSecondaryMediaType(e.target.value as "image" | "video")}
          >
            <option value="image">{a.productForm.mediaImage}</option>
            <option value="video">{a.productForm.mediaVideo}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">الوسيط الثاني: الرابط</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={secondaryMediaUrl}
            onChange={(e) => setSecondaryMediaUrl(e.target.value)}
            placeholder="https://"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">الوسيط الثالث: النوع</label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={tertiaryMediaType}
            onChange={(e) => setTertiaryMediaType(e.target.value as "image" | "video")}
          >
            <option value="image">{a.productForm.mediaImage}</option>
            <option value="video">{a.productForm.mediaVideo}</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">الوسيط الثالث: الرابط</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={tertiaryMediaUrl}
            onChange={(e) => setTertiaryMediaUrl(e.target.value)}
            placeholder="https://"
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان قسم التقييمات — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={testimonialsTitleAr}
            onChange={(e) => setTestimonialsTitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Testimonials title — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={testimonialsTitleFr}
            onChange={(e) => setTestimonialsTitleFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان قسم الوسائط — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={mediaCaptionAr}
            onChange={(e) => setMediaCaptionAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Media section title — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={mediaCaptionFr}
            onChange={(e) => setMediaCaptionFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان الأسئلة الشائعة — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={faqTitleAr}
            onChange={(e) => setFaqTitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">FAQ title — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={faqTitleFr}
            onChange={(e) => setFaqTitleFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان قسم التواصل — {a.productForm.langArabic}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={contactTitleAr}
            onChange={(e) => setContactTitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Contact title — {a.productForm.langFrench}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={contactTitleFr}
            onChange={(e) => setContactTitleFr(e.target.value)}
            dir="ltr"
          />
        </div>

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.features}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.featuresHintBilingual}</p>
            </div>
            <button
              type="button"
              onClick={() => setFeatureRows((f) => [...f, { ar: "", fr: "" }])}
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addFeature}
            </button>
          </div>
          <div className="space-y-3">
            {featureRows.map((row, i) => (
              <div
                key={`feat-${i}`}
                className="rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.langArabic}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                      value={row.ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFeatureRows((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, ar: v };
                          return next;
                        });
                      }}
                      placeholder={a.productForm.featurePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.langFrench}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                      value={row.fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFeatureRows((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, fr: v };
                          return next;
                        });
                      }}
                      placeholder={a.productForm.featurePlaceholderFr}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                    onClick={() => setFeatureRows((prev) => moveAt(prev, i, -1))}
                    disabled={i === 0}
                  >
                    {a.productForm.moveUp}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                    onClick={() => setFeatureRows((prev) => moveAt(prev, i, 1))}
                    disabled={i === featureRows.length - 1}
                  >
                    {a.productForm.moveDown}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
                    onClick={() =>
                      setFeatureRows((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    {a.productForm.removeItem}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {featureRows.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">—</p>
          ) : null}
        </section>

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.gallery}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.galleryHint}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setGallery((g) => [...g, { id: newRowId(), url: "" }])
              }
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addGalleryImage}
            </button>
          </div>
          <div className="space-y-3">
            {gallery.map((row, i) => (
              <GalleryUrlRow
                key={row.id}
                url={row.url}
                onChange={(v) =>
                  setGallery((prev) => {
                    const next = [...prev];
                    const cur = next[i];
                    if (cur) next[i] = { ...cur, url: v };
                    return next;
                  })
                }
                onRemove={() =>
                  setGallery((prev) => prev.filter((_, j) => j !== i))
                }
                canMoveUp={i > 0}
                canMoveDown={i < gallery.length - 1}
                onMoveUp={() => setGallery((prev) => moveAt(prev, i, -1))}
                onMoveDown={() => setGallery((prev) => moveAt(prev, i, 1))}
              />
            ))}
          </div>
          {gallery.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">—</p>
          ) : null}
        </section>

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.testimonialsSection}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.testimonialsHintBilingual}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setTestimonials((t) => [
                  ...t,
                  {
                    id: newRowId(),
                    name_ar: "",
                    name_fr: "",
                    quote_ar: "",
                    quote_fr: "",
                    role_ar: "",
                    role_fr: "",
                  },
                ])
              }
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addTestimonial}
            </button>
          </div>
          <div className="space-y-4">
            {testimonials.map((t, i) => (
              <div
                key={t.id}
                className="space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-3"
              >
                <p className="text-xs font-semibold text-[var(--muted)]">{a.productForm.langArabic}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialName}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.name_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, name_ar: v };
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialRole}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.role_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, role_ar: v };
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialQuote}</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={t.quote_ar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTestimonials((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, quote_ar: v };
                        return next;
                      });
                    }}
                  />
                </div>
                <p className="text-xs font-semibold text-[var(--muted)]">{a.productForm.langFrench}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialName}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.name_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, name_fr: v };
                          return next;
                        });
                      }}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialRole}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.role_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, role_fr: v };
                          return next;
                        });
                      }}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialQuote}</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={t.quote_fr}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTestimonials((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, quote_fr: v };
                        return next;
                      });
                    }}
                    dir="ltr"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline disabled:opacity-40"
                    onClick={() =>
                      setTestimonials((prev) => moveAt(prev, i, -1))
                    }
                    disabled={i === 0}
                  >
                    {a.productForm.moveUp}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline disabled:opacity-40"
                    onClick={() =>
                      setTestimonials((prev) => moveAt(prev, i, 1))
                    }
                    disabled={i === testimonials.length - 1}
                  >
                    {a.productForm.moveDown}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 underline dark:text-red-400"
                    onClick={() =>
                      setTestimonials((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    {a.productForm.removeItem}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {testimonials.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">—</p>
          ) : null}
        </section>

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.faqSection}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.faqHintBilingual}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setFaqs((f) => [
                  ...f,
                  { id: newRowId(), q_ar: "", q_fr: "", a_ar: "", a_fr: "" },
                ])
              }
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addFaq}
            </button>
          </div>
          <div className="space-y-4">
            {faqs.map((item, i) => (
              <div
                key={item.id}
                className="space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-3"
              >
                <p className="text-xs font-semibold text-[var(--muted)]">{a.productForm.langArabic}</p>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.faqQuestion}</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={item.q_ar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, q_ar: v };
                        return next;
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.faqAnswer}</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={item.a_ar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, a_ar: v };
                        return next;
                      });
                    }}
                  />
                </div>
                <p className="text-xs font-semibold text-[var(--muted)]">{a.productForm.langFrench}</p>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.faqQuestion}</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={item.q_fr}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, q_fr: v };
                        return next;
                      });
                    }}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.faqAnswer}</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={item.a_fr}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, a_fr: v };
                        return next;
                      });
                    }}
                    dir="ltr"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline disabled:opacity-40"
                    onClick={() => setFaqs((prev) => moveAt(prev, i, -1))}
                    disabled={i === 0}
                  >
                    {a.productForm.moveUp}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline disabled:opacity-40"
                    onClick={() => setFaqs((prev) => moveAt(prev, i, 1))}
                    disabled={i === faqs.length - 1}
                  >
                    {a.productForm.moveDown}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 underline dark:text-red-400"
                    onClick={() => setFaqs((prev) => prev.filter((_, j) => j !== i))}
                  >
                    {a.productForm.removeItem}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {faqs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">—</p>
          ) : null}
        </section>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.metaPixel}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={metaPixel}
            onChange={(e) => setMetaPixel(e.target.value)}
            placeholder={a.productForm.metaPlaceholder}
            dir="ltr"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.whatsappTemplate}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.whatsappTemplateHint}</p>
          <textarea
            rows={4}
            className="mt-2 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={whatsAppTemplate}
            onChange={(e) => setWhatsAppTemplate(e.target.value)}
            placeholder="مثال: شكراً لطلبكم! سيتم التواصل معكم قريباً."
          />
        </div>

        {mode === "edit" ? (
          <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{a.productForm.legacySlugs}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.legacySlugsHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setOldSlugs((s) => [...s, ""])}
                className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
              >
                {a.productForm.addLegacySlug}
              </button>
            </div>
            <div className="space-y-2">
              {oldSlugs.map((slug, i) => (
                <div
                  key={`os-${i}`}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-2 sm:flex-row sm:items-center"
                >
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[var(--accent-muted)] px-3 py-2 font-mono text-sm"
                    value={slug}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOldSlugs((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    placeholder={a.productForm.legacySlugPlaceholder}
                    dir="ltr"
                  />
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                      onClick={() => setOldSlugs((prev) => moveAt(prev, i, -1))}
                      disabled={i === 0}
                    >
                      {a.productForm.moveUp}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                      onClick={() => setOldSlugs((prev) => moveAt(prev, i, 1))}
                      disabled={i === oldSlugs.length - 1}
                    >
                      {a.productForm.moveDown}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
                      onClick={() =>
                        setOldSlugs((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      {a.productForm.removeItem}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {oldSlugs.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">—</p>
            ) : null}
          </section>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-60"
        >
          {busy
            ? a.productForm.saving
            : mode === "create"
              ? a.productForm.create
              : a.productForm.saveChanges}
        </button>
        {mode === "edit" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
            className="rounded-xl border border-red-300 px-6 py-3 text-sm font-semibold text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
          >
            {a.productForm.delete}
          </button>
        ) : null}
      </div>
    </form>
  );
}
