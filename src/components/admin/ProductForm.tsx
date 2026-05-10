"use client";

import type { ProductRow, Testimonial, FAQ } from "@/types";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
  type ProductPayload,
} from "@/app/admin/(dashboard)/products/actions";
import { adminAr as a } from "@/locales/admin-ar";
import { BRAND_COLOR } from "@/lib/site-branding";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

function stickyEndsAtToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseStickyEndsAtLocal(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function initialHeaderBarAr(p: ProductRow | undefined): string {
  if (!p) return "";
  const direct = p.header_bar_text_ar?.trim();
  if (direct) return direct;
  return [
    p.header_offer_text_ar,
    p.header_discount_text_ar,
    p.header_promo_text_ar,
    p.header_announcement_text_ar,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

function initialHeaderBarFr(p: ProductRow | undefined): string {
  if (!p) return "";
  const direct = p.header_bar_text_fr?.trim();
  if (direct) return direct;
  return [
    p.header_offer_text_fr,
    p.header_discount_text_fr,
    p.header_promo_text_fr,
    p.header_announcement_text_fr,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
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
  image: string;
  rating: string;
  location_ar: string;
  location_fr: string;
};

type FaqDraft = {
  id: string;
  q_ar: string;
  q_fr: string;
  a_ar: string;
  a_fr: string;
};

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
  const [ctaBannerBgImageUrl, setCtaBannerBgImageUrl] = useState(initial?.cta_banner_background_image_url ?? "");
  const [ctaBannerOverlayPct, setCtaBannerOverlayPct] = useState(() =>
    Math.round(Math.min(100, Math.max(0, (initial?.cta_banner_image_overlay ?? 0.45) * 100))),
  );
  const [stickyFooterEndsAt, setStickyFooterEndsAt] = useState(() =>
    stickyEndsAtToDatetimeLocal(initial?.sticky_footer_offer_ends_at),
  );
  const [stickyFooterTimerLabelAr, setStickyFooterTimerLabelAr] = useState(
    initial?.sticky_footer_timer_label_ar ?? "",
  );
  const [stickyFooterTimerLabelFr, setStickyFooterTimerLabelFr] = useState(
    initial?.sticky_footer_timer_label_fr ?? "",
  );
  const [stickyFooterSavingsAr, setStickyFooterSavingsAr] = useState(
    initial?.sticky_footer_savings_badge_ar ?? "",
  );
  const [stickyFooterSavingsFr, setStickyFooterSavingsFr] = useState(
    initial?.sticky_footer_savings_badge_fr ?? "",
  );
  const [stickyFooterShowTimer, setStickyFooterShowTimer] = useState(
    initial?.sticky_footer_show_timer ?? true,
  );
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
          image: t.image ?? "",
          rating: t.rating != null ? String(t.rating) : "",
          location_ar: t.location ?? "",
          location_fr: initial.testimonials_fr[i]?.location ?? "",
        }))
      : [],
  );
  const [uploadingTestimonialId, setUploadingTestimonialId] = useState<string | null>(null);
  const [uploadingCtaBanner, setUploadingCtaBanner] = useState(false);
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

  const [brandColor, setBrandColor] = useState(initial?.brand_color ?? BRAND_COLOR);
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [headerBarAr, setHeaderBarAr] = useState(() => initialHeaderBarAr(initial));
  const [headerBarFr, setHeaderBarFr] = useState(() => initialHeaderBarFr(initial));
  const [headerBarMaxLines, setHeaderBarMaxLines] = useState(
    () => initial?.header_bar_max_lines ?? 0,
  );
  const [headerBarFontSizePx, setHeaderBarFontSizePx] = useState(() => {
    const v = initial?.header_bar_font_size_px;
    return v != null && Number.isFinite(v) ? String(v) : "";
  });
  const [headerCtaAr, setHeaderCtaAr] = useState(initial?.header_cta_text_ar ?? "");
  const [headerCtaFr, setHeaderCtaFr] = useState(initial?.header_cta_text_fr ?? "");
  const [ctaBannerBgColor, setCtaBannerBgColor] = useState(initial?.cta_banner_background_color ?? "");
  const [stickyFooterBarBg, setStickyFooterBarBg] = useState(initial?.sticky_footer_bar_bg_color ?? "");
  const [stickyFooterBadgeBg, setStickyFooterBadgeBg] = useState(
    initial?.sticky_footer_badge_bg_color ?? "",
  );
  const [stickyFooterTimerBoxBg, setStickyFooterTimerBoxBg] = useState(
    initial?.sticky_footer_timer_box_bg_color ?? "",
  );
  const [stickyFooterTimerDigit, setStickyFooterTimerDigit] = useState(
    initial?.sticky_footer_timer_digit_color ?? "",
  );
  const [stickyFooterCtaBg, setStickyFooterCtaBg] = useState(initial?.sticky_footer_cta_bg_color ?? "");
  const [stickyFooterCtaFg, setStickyFooterCtaFg] = useState(initial?.sticky_footer_cta_text_color ?? "");
  const [statsSectionTitleAr, setStatsSectionTitleAr] = useState(initial?.stats_section_title_ar ?? "");
  const [statsSectionTitleFr, setStatsSectionTitleFr] = useState(initial?.stats_section_title_fr ?? "");
  const [testimonialsBadgeAr, setTestimonialsBadgeAr] = useState(initial?.testimonials_badge_ar ?? "");
  const [testimonialsBadgeFr, setTestimonialsBadgeFr] = useState(initial?.testimonials_badge_fr ?? "");
  const [footerNoteAr, setFooterNoteAr] = useState(initial?.footer_note_ar ?? "");
  const [footerNoteFr, setFooterNoteFr] = useState(initial?.footer_note_fr ?? "");
  const [galleryUrls, setGalleryUrls] = useState<string[]>(() =>
    initial?.gallery?.length ? [...initial.gallery] : [],
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
      const image = t.image.trim();
      const location = t.location_ar.trim();
      const ratingNum = Number.parseFloat(t.rating);
      const merged: Testimonial = {
        ...base,
        ...(role ? { role } : {}),
        ...(image ? { image } : {}),
        ...(location ? { location } : {}),
        ...(!Number.isNaN(ratingNum) && ratingNum > 0 ? { rating: Math.min(5, Number(ratingNum.toFixed(1))) } : {}),
      };
      return merged;
    });
    const cleanedTestimonialsFr: Testimonial[] = testimonialPairs.map((t) => {
      const base: Testimonial = {
        name: t.name_fr.trim(),
        quote: t.quote_fr.trim(),
      };
      const role = t.role_fr.trim();
      const image = t.image.trim();
      const location = t.location_fr.trim();
      const ratingNum = Number.parseFloat(t.rating);
      const merged: Testimonial = {
        ...base,
        ...(role ? { role } : {}),
        ...(image ? { image } : {}),
        ...(location ? { location } : {}),
        ...(!Number.isNaN(ratingNum) && ratingNum > 0 ? { rating: Math.min(5, Number(ratingNum.toFixed(1))) } : {}),
      };
      return merged;
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
      brand_color: brandColor,
      logo_url: logoUrl.trim(),
      name_ar: nameAr.trim(),
      name_fr: nameFr,
      hero_subtitle_ar: heroSubtitleAr.trim(),
      hero_subtitle_fr: heroSubtitleFr,
      header_bar_text_ar: headerBarAr.trim(),
      header_bar_text_fr: headerBarFr.trim(),
      header_bar_max_lines: Math.min(
        12,
        Math.max(0, Math.round(Number(headerBarMaxLines)) || 0),
      ),
      header_bar_font_size_px: (() => {
        const t = headerBarFontSizePx.trim();
        if (!t) return null;
        const n = Number.parseFloat(t);
        if (!Number.isFinite(n)) return null;
        return Math.min(24, Math.max(10, Math.round(n)));
      })(),
      header_cta_text_ar: headerCtaAr.trim(),
      header_cta_text_fr: headerCtaFr.trim(),
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
      stats_section_title_ar: statsSectionTitleAr.trim(),
      stats_section_title_fr: statsSectionTitleFr.trim(),
      testimonials_badge_ar: testimonialsBadgeAr.trim(),
      testimonials_badge_fr: testimonialsBadgeFr.trim(),
      footer_note_ar: footerNoteAr.trim(),
      footer_note_fr: footerNoteFr.trim(),
      cta_banner_background_color: ctaBannerBgColor.trim(),
      cta_banner_background_image_url: ctaBannerBgImageUrl.trim(),
      cta_banner_image_overlay: Math.min(1, Math.max(0, ctaBannerOverlayPct / 100)),
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
      gallery: galleryUrls.map((u) => u.trim()).filter(Boolean),
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
      old_slugs:
        mode === "edit" && initial?.old_slugs?.length
          ? initial.old_slugs.map((s) => s.trim()).filter(Boolean)
          : [],
      sticky_footer_offer_ends_at: parseStickyEndsAtLocal(stickyFooterEndsAt),
      sticky_footer_timer_label_ar: stickyFooterTimerLabelAr.trim(),
      sticky_footer_timer_label_fr: stickyFooterTimerLabelFr.trim(),
      sticky_footer_savings_badge_ar: stickyFooterSavingsAr.trim(),
      sticky_footer_savings_badge_fr: stickyFooterSavingsFr.trim(),
      sticky_footer_bar_bg_color: stickyFooterBarBg.trim(),
      sticky_footer_badge_bg_color: stickyFooterBadgeBg.trim(),
      sticky_footer_timer_box_bg_color: stickyFooterTimerBoxBg.trim(),
      sticky_footer_timer_digit_color: stickyFooterTimerDigit.trim(),
      sticky_footer_cta_bg_color: stickyFooterCtaBg.trim(),
      sticky_footer_cta_text_color: stickyFooterCtaFg.trim(),
      sticky_footer_show_timer: stickyFooterShowTimer,
    };
  }

  async function uploadTestimonialImage(testimonialId: string, file: File) {
    setUploadingTestimonialId(testimonialId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "testimonials");
      const response = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: fd,
      });
      const payload = (await response.json()) as { signedUrl?: string; error?: string };
      if (!response.ok || !payload.signedUrl) {
        throw new Error(payload.error || "فشل رفع الصورة.");
      }
      setTestimonials((prev) =>
        prev.map((item) =>
          item.id === testimonialId ? { ...item, image: payload.signedUrl as string } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الصورة.");
    } finally {
      setUploadingTestimonialId(null);
    }
  }

  async function uploadCtaBannerImage(file: File) {
    setUploadingCtaBanner(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "cta-banner");
      const response = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: fd,
      });
      const payload = (await response.json()) as { signedUrl?: string; error?: string };
      if (!response.ok || !payload.signedUrl) {
        throw new Error(payload.error || "فشل رفع صورة البانر.");
      }
      setCtaBannerBgImageUrl(payload.signedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع صورة البانر.");
    } finally {
      setUploadingCtaBanner(false);
    }
  }

  async function uploadLogoImage(file: File) {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "landing-logos");
      const response = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: fd,
      });
      const payload = (await response.json()) as { signedUrl?: string; error?: string };
      if (!response.ok || !payload.signedUrl) {
        throw new Error(payload.error || "فشل رفع الشعار.");
      }
      setLogoUrl(payload.signedUrl as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الشعار.");
    } finally {
      setUploadingLogo(false);
    }
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
      <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        <h2 className="text-base font-bold text-[var(--foreground)]">إعدادات صفحة الهبوط</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.introBody}</p>
      </div>

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

        <section className="sm:col-span-2 space-y-4 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{a.productForm.sectionBrand}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionBrandHint}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">لون التمييز (Hex)</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder={BRAND_COLOR}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">شعار أعلى الصفحة (رابط HTTPS)</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://"
                dir="ltr"
              />
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-sm file:mr-2 file:rounded-lg file:border file:border-[var(--accent-muted)] file:bg-[var(--card)] file:px-3 file:py-2"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogoImage(f);
                  e.target.value = "";
                }}
              />
              {uploadingLogo ? <p className="mt-1 text-xs text-[var(--muted)]">جارٍ رفع الشعار…</p> : null}
            </div>
          </div>
        </section>

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{a.productForm.sectionHeader}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionHeaderHint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">{a.productForm.headerBarArabic}</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerBarAr}
                onChange={(e) => setHeaderBarAr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">{a.productForm.headerBarFrench}</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerBarFr}
                onChange={(e) => setHeaderBarFr(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">{a.productForm.headerBarMaxLinesLabel}</label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerBarMaxLines}
                onChange={(e) => setHeaderBarMaxLines(Number(e.target.value))}
              >
                <option value={0}>{a.productForm.headerBarMaxLinesUnlimited}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {a.productForm.headerBarLinesMaxSuffix}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{a.productForm.headerBarMaxLinesHint}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">{a.productForm.headerBarFontSizeLabel}</label>
              <input
                type="number"
                min={10}
                max={24}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerBarFontSizePx}
                onChange={(e) => setHeaderBarFontSizePx(e.target.value)}
                placeholder="12"
                dir="ltr"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">{a.productForm.headerBarFontSizeHint}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">نداء الرأس (سطر إضافي) — عربي</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerCtaAr}
                onChange={(e) => setHeaderCtaAr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">Header CTA — FR</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={headerCtaFr}
                onChange={(e) => setHeaderCtaFr(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
        </section>

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
          <label className="text-sm font-medium">{a.productForm.statsSectionTitle} — عربي</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={statsSectionTitleAr}
            onChange={(e) => setStatsSectionTitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.statsSectionTitle} — FR</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={statsSectionTitleFr}
            onChange={(e) => setStatsSectionTitleFr(e.target.value)}
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

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.gallery}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.galleryHint}</p>
            </div>
            <button
              type="button"
              onClick={() => setGalleryUrls((g) => [...g, ""])}
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addGalleryImage}
            </button>
          </div>
          <div className="space-y-2">
            {galleryUrls.map((url, gi) => (
              <div key={`gal-${gi}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                  value={url}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGalleryUrls((prev) => {
                      const next = [...prev];
                      next[gi] = v;
                      return next;
                    });
                  }}
                  placeholder={a.productForm.galleryUrlPlaceholder}
                  dir="ltr"
                />
                <button
                  type="button"
                  className="rounded-lg border border-[var(--accent-muted)] px-2 py-2 text-xs text-red-700"
                  onClick={() => setGalleryUrls((prev) => prev.filter((_, j) => j !== gi))}
                >
                  {a.productForm.removeItem}
                </button>
                {url.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview
                  <img src={url.trim()} alt="" className="h-14 w-14 rounded-md border border-[var(--accent-muted)] object-cover" />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.testimonialsBadgeLabel} — عربي</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={testimonialsBadgeAr}
            onChange={(e) => setTestimonialsBadgeAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.testimonialsBadgeLabel} — FR</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={testimonialsBadgeFr}
            onChange={(e) => setTestimonialsBadgeFr(e.target.value)}
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

        <section className="sm:col-span-2 space-y-4 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-4">
          <div>
            <h3 className="text-sm font-semibold">بانر الطلب (قبل التواصل)</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              يظهر بين الأسئلة الشائعة وقسم التواصل. ارفع صورة خلفية أو الصق رابطاً مباشراً، واضبط شفافية الطبقة
              الداكنة فوق الصورة لتحسين وضوح الزر.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-1">
            <div>
              <label className="text-sm font-medium">لون خلفية البانر بدون صورة (Hex، اختياري)</label>
              <p className="mt-1 text-xs text-[var(--muted)]">
                إذا لم يُضَف رابط صورة أعلاه يُستخدم هذا اللون مع تدرّج افتراضي عند تركه فارغاً.
              </p>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={ctaBannerBgColor}
                onChange={(e) => setCtaBannerBgColor(e.target.value)}
                placeholder="#006B0C"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">صورة الخلفية</label>
              <p className="mt-1 text-xs text-[var(--muted)]">
                تُعرض داخل البطاقة. دون صورة تُستخدم ألوان القالب الافتراضية.
              </p>
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm file:mr-2 file:rounded-lg file:border file:border-[var(--accent-muted)] file:bg-[var(--card)] file:px-3 file:py-2"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadCtaBannerImage(f);
                  e.target.value = "";
                }}
              />
              {uploadingCtaBanner ? <p className="mt-1 text-xs text-[var(--muted)]">جار الرفع...</p> : null}
              <input
                className="mt-2 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={ctaBannerBgImageUrl}
                onChange={(e) => setCtaBannerBgImageUrl(e.target.value)}
                placeholder="https://"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">ظل داكن فوق الصورة (0–100٪)</label>
              <p className="mt-1 text-xs text-[var(--muted)]">يُستخدم عند وجود صورة خلفية لتحسين تباين الزر.</p>
              <input
                type="range"
                min={0}
                max={100}
                value={ctaBannerOverlayPct}
                onChange={(e) => setCtaBannerOverlayPct(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">{ctaBannerOverlayPct}%</p>
            </div>
          </div>
        </section>

        <section
          id="sticky-footer"
          className="sm:col-span-2 space-y-4 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4"
        >
          <div>
            <h3 className="text-sm font-semibold">الشريط السفلي الثابت (أسعار + عدّاد + زر الطلب)</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              يظهر ملصقاً على جميع مقاسات الشاشة. الأسعار والخصم من حقول السعر أعلاه. نص زر الطلب من حقول «cta» أعلاه.
              اختياري: وقت انتهاء العرض للعد التنازلي؛ إن ترك فارغاً أو عُطّل العدّاد يُخفى المؤقت ويبقى السعر والزر.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={stickyFooterShowTimer}
              onChange={(e) => setStickyFooterShowTimer(e.target.checked)}
              className="rounded border-[var(--accent-muted)]"
            />
            إظهار العد التنازلي عند تعيين تاريخ الانتهاء
          </label>
          <div>
            <label className="text-sm font-medium">انتهاء العرض (تاريخ ووقت محلي)</label>
            <input
              type="datetime-local"
              className="mt-1 w-full max-w-md rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
              value={stickyFooterEndsAt}
              onChange={(e) => setStickyFooterEndsAt(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">عنوان أسفل المؤقت — عربي</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterTimerLabelAr}
                onChange={(e) => setStickyFooterTimerLabelAr(e.target.value)}
                placeholder="العرض ينتهي خلال"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Timer caption — FR</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterTimerLabelFr}
                onChange={(e) => setStickyFooterTimerLabelFr(e.target.value)}
                placeholder="L'offre se termine dans"
                dir="ltr"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">شارة التوفير — عربي (اختياري)</label>
              <p className="mt-1 text-xs text-[var(--muted)]">إن تُرك فارغاً مع وجود سعر مخفض يُحسب تلقائياً.</p>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterSavingsAr}
                onChange={(e) => setStickyFooterSavingsAr(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Badge économies — FR (optionnel)</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterSavingsFr}
                onChange={(e) => setStickyFooterSavingsFr(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[var(--foreground)]">{a.productForm.sectionStickyColors}</h4>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionStickyColorsHint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--muted)]">خلفية الشريط</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterBarBg}
                onChange={(e) => setStickyFooterBarBg(e.target.value)}
                placeholder="#14532d"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">شارة التوفير</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterBadgeBg}
                onChange={(e) => setStickyFooterBadgeBg(e.target.value)}
                placeholder="#22c55e"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">صندوق المؤقت</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterTimerBoxBg}
                onChange={(e) => setStickyFooterTimerBoxBg(e.target.value)}
                placeholder="#ffffff"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">أرقام المؤقت</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterTimerDigit}
                onChange={(e) => setStickyFooterTimerDigit(e.target.value)}
                placeholder="#15803d"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">زر الطلب (خلفية)</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterCtaBg}
                onChange={(e) => setStickyFooterCtaBg(e.target.value)}
                placeholder="#ffffff"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">زر الطلب (نص)</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={stickyFooterCtaFg}
                onChange={(e) => setStickyFooterCtaFg(e.target.value)}
                placeholder="#14532d"
                dir="ltr"
              />
            </div>
          </div>
        </section>

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

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.footerNoteLabel} — عربي</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={footerNoteAr}
            onChange={(e) => setFooterNoteAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.footerNoteLabel} — FR</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={footerNoteFr}
            onChange={(e) => setFooterNoteFr(e.target.value)}
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
                    image: "",
                    rating: "",
                    location_ar: "",
                    location_fr: "",
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
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="text-xs text-[var(--muted)]">صورة العميل (رابط مباشر)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.image}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, image: v };
                          return next;
                        });
                      }}
                      placeholder="https://..."
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">أو رفع صورة</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="store-file-input mt-1"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void uploadTestimonialImage(t.id, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                {uploadingTestimonialId === t.id ? (
                  <p className="text-xs text-[var(--muted)]">جار رفع الصورة...</p>
                ) : null}
                {t.image.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview for external/Supabase URLs
                  <img
                    src={t.image.trim()}
                    alt=""
                    className="h-16 w-16 rounded-full border border-[var(--accent-muted)] object-cover"
                  />
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-[var(--muted)]">التقييم (اختياري 1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="0.1"
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.rating}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, rating: v };
                          return next;
                        });
                      }}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">الموقع — {a.productForm.langArabic}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.location_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, location_ar: v };
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>
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
                <div>
                  <label className="text-xs text-[var(--muted)]">Location — {a.productForm.langFrench}</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={t.location_fr}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTestimonials((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, location_fr: v };
                        return next;
                      });
                    }}
                    dir="ltr"
                  />
                </div>
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

        <section className="sm:col-span-2 space-y-4 rounded-xl border border-dashed border-[var(--accent-muted)] bg-[var(--background)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{a.productForm.sectionIntegrations}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionIntegrationsHint}</p>
          </div>
          <div>
            <label className="text-sm font-medium">{a.productForm.metaPixel}</label>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
              value={metaPixel}
              onChange={(e) => setMetaPixel(e.target.value)}
              placeholder={a.productForm.metaPlaceholder}
              dir="ltr"
            />
          </div>
          <div>
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
        </section>
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
