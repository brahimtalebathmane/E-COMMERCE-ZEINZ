"use client";

import type {
  ProductRow,
  Testimonial,
  FAQ,
  ProductTestingStatus,
  ProductSourcingType,
} from "@/types";
import {
  completeLandingSetupAction,
  createProductAction,
  deleteProductAction,
  saveLandingConfigurationAction,
  updateProductAction,
  type ProductPayload,
} from "@/app/admin/(dashboard)/products/actions";
import {
  ProductFormCtaStickySection,
  ProductFormFaqsSection,
  ProductFormFeaturesSection,
  ProductFormGallerySection,
  ProductFormTestimonialsSection,
} from "@/components/admin/ProductFormListSections";
import {
  type FaqDraft,
  type FeatureRow,
  type TestimonialDraft,
} from "@/components/admin/product-form-shared";
import { adminAr as a } from "@/locales/admin-ar";
import { BRAND_COLOR } from "@/lib/site-branding";
import { normalizeProductSlug } from "@/lib/product-slug";
import { getPublicSiteUrlClient } from "@/lib/site-url";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

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

function initialTopBannerOfferText(p: ProductRow | undefined): string {
  if (!p) return "";
  const unifiedAr = p.header_bar_text_ar?.trim();
  if (unifiedAr) return unifiedAr;
  const unifiedFr = p.header_bar_text_fr?.trim();
  if (unifiedFr) return unifiedFr;
  const legacyAr = [
    p.header_offer_text_ar,
    p.header_discount_text_ar,
    p.header_promo_text_ar,
    p.header_announcement_text_ar,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
  if (legacyAr) return legacyAr;
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

type Props = {
  mode: "create" | "edit" | "landing-setup";
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
  const isLandingSetup = mode === "landing-setup";
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
  const [testStatus, setTestStatus] = useState<ProductTestingStatus>(
    initial?.test_status ?? "under_research",
  );
  const [sourcingType, setSourcingType] = useState<ProductSourcingType | "">(
    initial?.sourcing_type ?? "",
  );
  const [sourcingLink, setSourcingLink] = useState(initial?.sourcing_link ?? "");
  const [costPrice, setCostPrice] = useState(
    initial?.cost_price != null ? String(initial.cost_price) : "",
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
  const [slugInput, setSlugInput] = useState(initial?.slug ?? "");

  const siteBase = getPublicSiteUrlClient();
  const previewSlug = useMemo(() => {
    const normalized = normalizeProductSlug(slugInput);
    if (normalized) return normalized;
    if (mode === "create") {
      return normalizeProductSlug(nameAr) || "your-slug";
    }
    return initial?.slug ?? "your-slug";
  }, [slugInput, nameAr, mode, initial?.slug]);
  const landingPreviewUrl = `${siteBase}/${previewSlug}`;

  const [brandColor, setBrandColor] = useState(initial?.brand_color ?? BRAND_COLOR);
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [topBannerOfferText, setTopBannerOfferText] = useState(() =>
    initialTopBannerOfferText(initial),
  );
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
      header_bar_text_ar: topBannerOfferText.replace(/\s+/g, " ").trim(),
      header_bar_text_fr: "",
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
      slug: slugInput.trim(),
      old_slugs: [],
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
      test_status: testStatus,
      sourcing_type: sourcingType === "" ? null : sourcingType,
      sourcing_link: sourcingLink,
      cost_price: (() => {
        const t = costPrice.trim();
        if (!t) return null;
        const n = Number.parseFloat(t);
        return Number.isFinite(n) ? n : null;
      })(),
    };
  }

  const uploadTestimonialImage = useCallback(async (testimonialId: string, file: File) => {
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
  }, []);

  const uploadCtaBannerImage = useCallback(async (file: File) => {
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
  }, []);

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
      if (!isLandingSetup) {
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
      }
      if (mode === "landing-setup" && initial) {
        const result = await saveLandingConfigurationAction(initial.id, payload);
        if (!result.ok) {
          throw new Error(result.error);
        }
        toast.success(a.productForm.saved);
      } else if (mode === "create") {
        await createProductAction(payload);
        toast.success(a.productForm.created);
      } else if (initial) {
        const result = await updateProductAction(initial.id, payload);
        if (!result.ok) {
          throw new Error(result.error);
        }
        toast.success(a.productForm.saved);
      }
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : a.productForm.failedSave;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onCompleteResearch(e: React.MouseEvent) {
    e.preventDefault();
    if (!initial || mode !== "landing-setup" || initial.test_status !== "under_research") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      const result = await completeLandingSetupAction(initial.id, payload);
      if (!result.ok) {
        throw new Error(result.error);
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
      const result = await deleteProductAction(initial.id);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(a.productForm.deleted);
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : a.productForm.failedDelete;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8 text-start" dir="rtl">
      <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        <h2 className="text-base font-bold text-[var(--foreground)]">إعدادات صفحة الهبوط</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {isLandingSetup ? a.landingSetup.subtitle : a.productForm.introBody}
        </p>
      </div>

      <section className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 text-sm">
          <label className="text-sm font-medium">{a.productForm.slugLabel}</label>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.slugHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2" dir="ltr">
            <span className="shrink-0 text-[var(--muted)]">{siteBase}/</span>
            <input
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--accent-muted)] px-3 py-2 font-mono text-sm"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder={previewSlug}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {a.productForm.slugPreviewLabel}{" "}
            <a
              href={landingPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[var(--accent)] underline"
            >
              {landingPreviewUrl}
            </a>
          </p>
          {initial?.old_slugs?.length ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {a.productForm.slugLegacyNote}{" "}
              <span className="font-mono" dir="ltr">
                {initial.old_slugs.join(", ")}
              </span>
            </p>
          ) : null}
      </section>

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
          <div>
            <label className="text-xs font-medium text-[var(--muted)]">{a.productForm.topBannerOffer}</label>
            <input
              type="text"
              maxLength={280}
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
              value={topBannerOfferText}
              onChange={(e) => setTopBannerOfferText(e.target.value)}
              placeholder={a.productForm.topBannerOfferPlaceholder}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
            required={!isLandingSetup}
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
          {!isLandingSetup ? (
            <p className="mt-1 text-xs text-[var(--muted)]">إلزامي: السطر الأول يُستخدم كوصف أساسي في الهبوط.</p>
          ) : null}
          <textarea
            required={!isLandingSetup}
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
          {!isLandingSetup ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              إلزامي — اضغط Enter للانتقال إلى سطر جديد
            </p>
          ) : null}
          <textarea
            required={!isLandingSetup}
            rows={3}
            className="mt-1 w-full resize-y whitespace-pre-wrap rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm leading-relaxed"
            value={heroSubtitleAr}
            onChange={(e) => setHeroSubtitleAr(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Hero subtitle — {a.productForm.langFrench}
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Press Enter to start a new line
          </p>
          <textarea
            rows={3}
            className="mt-1 w-full resize-y whitespace-pre-wrap rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm leading-relaxed"
            value={heroSubtitleFr}
            onChange={(e) => setHeroSubtitleFr(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">نص زر الشراء — {a.productForm.langArabic}</label>
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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
          {!isLandingSetup ? (
            <p className="mt-1 text-xs text-[var(--muted)]">حد أدنى 3 أسطر</p>
          ) : null}
          <textarea
            required={!isLandingSetup}
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
          {!isLandingSetup ? (
            <p className="mt-1 text-xs text-[var(--muted)]">حد أدنى 3 أسطر</p>
          ) : null}
          <textarea
            required={!isLandingSetup}
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
        <div className="sm:col-span-2 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">{a.productForm.sectionPipeline}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionPipelineHint}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">{a.productForm.testStatus}</label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm disabled:opacity-60"
                value={testStatus}
                disabled={isLandingSetup}
                onChange={(e) =>
                  setTestStatus(e.target.value as ProductTestingStatus)
                }
              >
                <option value="under_research">
                  {a.productForm.testStatusUnderResearch}
                </option>
                <option value="ready_for_test">{a.productForm.testStatusReady}</option>
                <option value="testing">{a.productForm.testStatusTesting}</option>
                <option value="winner">{a.productForm.testStatusWinner}</option>
                <option value="failed">{a.productForm.testStatusFailed}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{a.productForm.sourcingType}</label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={sourcingType}
                onChange={(e) =>
                  setSourcingType(
                    e.target.value === ""
                      ? ""
                      : (e.target.value as ProductSourcingType),
                  )
                }
              >
                <option value="">{a.productForm.sourcingTypeUnset}</option>
                <option value="local">{a.productForm.sourcingLocal}</option>
                <option value="import">{a.productForm.sourcingImport}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">{a.productForm.sourcingLink}</label>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={sourcingLink}
                onChange={(e) => setSourcingLink(e.target.value)}
                placeholder={a.productForm.sourcingLinkPlaceholder}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{a.productForm.costPrice}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder={a.productForm.costPricePlaceholder}
                dir="ltr"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{a.productForm.price}</label>
          <input
            required={!isLandingSetup}
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
            required={!isLandingSetup}
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

        <ProductFormGallerySection galleryUrls={galleryUrls} setGalleryUrls={setGalleryUrls} />

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
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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

        <ProductFormCtaStickySection
          ctaBannerBgColor={ctaBannerBgColor}
          setCtaBannerBgColor={setCtaBannerBgColor}
          ctaBannerBgImageUrl={ctaBannerBgImageUrl}
          setCtaBannerBgImageUrl={setCtaBannerBgImageUrl}
          uploadingCtaBanner={uploadingCtaBanner}
          ctaBannerOverlayPct={ctaBannerOverlayPct}
          setCtaBannerOverlayPct={setCtaBannerOverlayPct}
          uploadCtaBannerImage={uploadCtaBannerImage}
          stickyFooterShowTimer={stickyFooterShowTimer}
          setStickyFooterShowTimer={setStickyFooterShowTimer}
          stickyFooterEndsAt={stickyFooterEndsAt}
          setStickyFooterEndsAt={setStickyFooterEndsAt}
          stickyFooterTimerLabelAr={stickyFooterTimerLabelAr}
          setStickyFooterTimerLabelAr={setStickyFooterTimerLabelAr}
          stickyFooterTimerLabelFr={stickyFooterTimerLabelFr}
          setStickyFooterTimerLabelFr={setStickyFooterTimerLabelFr}
          stickyFooterSavingsAr={stickyFooterSavingsAr}
          setStickyFooterSavingsAr={setStickyFooterSavingsAr}
          stickyFooterSavingsFr={stickyFooterSavingsFr}
          setStickyFooterSavingsFr={setStickyFooterSavingsFr}
          stickyFooterBarBg={stickyFooterBarBg}
          setStickyFooterBarBg={setStickyFooterBarBg}
          stickyFooterBadgeBg={stickyFooterBadgeBg}
          setStickyFooterBadgeBg={setStickyFooterBadgeBg}
          stickyFooterTimerBoxBg={stickyFooterTimerBoxBg}
          setStickyFooterTimerBoxBg={setStickyFooterTimerBoxBg}
          stickyFooterTimerDigit={stickyFooterTimerDigit}
          setStickyFooterTimerDigit={setStickyFooterTimerDigit}
          stickyFooterCtaBg={stickyFooterCtaBg}
          setStickyFooterCtaBg={setStickyFooterCtaBg}
          stickyFooterCtaFg={stickyFooterCtaFg}
          setStickyFooterCtaFg={setStickyFooterCtaFg}
        />

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">عنوان قسم التواصل — {a.productForm.langArabic}</label>
          {!isLandingSetup ? <p className="mt-1 text-xs text-[var(--muted)]">إلزامي</p> : null}
          <input
            required={!isLandingSetup}
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

        <ProductFormFeaturesSection featureRows={featureRows} setFeatureRows={setFeatureRows} />

        <ProductFormTestimonialsSection
          testimonials={testimonials}
          setTestimonials={setTestimonials}
          uploadingTestimonialId={uploadingTestimonialId}
          uploadTestimonialImage={uploadTestimonialImage}
        />

        <ProductFormFaqsSection faqs={faqs} setFaqs={setFaqs} />

        <section className="sm:col-span-2 space-y-4 rounded-xl border border-dashed border-[var(--accent-muted)] bg-[var(--background)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{a.productForm.sectionIntegrations}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.sectionIntegrationsHint}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">
              {a.productForm.metaPixel}{" "}
              <span className="text-xs">(Legacy — not used; unified site pixel from env)</span>
            </p>
            {initial?.meta_pixel_id ? (
              <p className="mt-1 font-mono text-xs text-[var(--muted)]" dir="ltr">
                {initial.meta_pixel_id}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">—</p>
            )}
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
            ? isLandingSetup
              ? a.landingSetup.saving
              : a.productForm.saving
            : isLandingSetup
              ? a.landingSetup.submit
              : mode === "create"
                ? a.productForm.create
                : a.productForm.saveChanges}
        </button>
        {mode === "landing-setup" && initial?.test_status === "under_research" ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => void onCompleteResearch(e)}
            className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60"
          >
            {a.landingSetup.completeResearch}
          </button>
        ) : null}
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
