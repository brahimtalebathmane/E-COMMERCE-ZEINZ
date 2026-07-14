"use client";

import type { Dispatch, SetStateAction } from "react";
import { memo } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import {
  moveAt,
  newRowId,
  type FaqDraft,
  type FeatureRow,
  type TestimonialDraft,
} from "@/components/admin/product-form-shared";

type GallerySectionProps = {
  galleryUrls: string[];
  setGalleryUrls: Dispatch<SetStateAction<string[]>>;
};

export const ProductFormGallerySection = memo(function ProductFormGallerySection({
  galleryUrls,
  setGalleryUrls,
}: GallerySectionProps) {
  return (
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
          <div
            key={`gal-${gi}`}
            className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-2"
          >
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
              <img
                src={url.trim()}
                alt=""
                className="h-14 w-14 rounded-md border border-[var(--accent-muted)] object-cover"
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
});

type CtaStickyProps = {
  ctaBannerBgColor: string;
  setCtaBannerBgColor: Dispatch<SetStateAction<string>>;
  ctaBannerBgImageUrl: string;
  setCtaBannerBgImageUrl: Dispatch<SetStateAction<string>>;
  uploadingCtaBanner: boolean;
  ctaBannerOverlayPct: number;
  setCtaBannerOverlayPct: Dispatch<SetStateAction<number>>;
  uploadCtaBannerImage: (file: File) => Promise<void>;
  stickyFooterShowTimer: boolean;
  setStickyFooterShowTimer: Dispatch<SetStateAction<boolean>>;
  stickyFooterEndsAt: string;
  setStickyFooterEndsAt: Dispatch<SetStateAction<string>>;
  stickyFooterTimerLabelAr: string;
  setStickyFooterTimerLabelAr: Dispatch<SetStateAction<string>>;
  stickyFooterTimerLabelFr: string;
  setStickyFooterTimerLabelFr: Dispatch<SetStateAction<string>>;
  stickyFooterSavingsAr: string;
  setStickyFooterSavingsAr: Dispatch<SetStateAction<string>>;
  stickyFooterSavingsFr: string;
  setStickyFooterSavingsFr: Dispatch<SetStateAction<string>>;
  stickyFooterBarBg: string;
  setStickyFooterBarBg: Dispatch<SetStateAction<string>>;
  stickyFooterBadgeBg: string;
  setStickyFooterBadgeBg: Dispatch<SetStateAction<string>>;
  stickyFooterTimerBoxBg: string;
  setStickyFooterTimerBoxBg: Dispatch<SetStateAction<string>>;
  stickyFooterTimerDigit: string;
  setStickyFooterTimerDigit: Dispatch<SetStateAction<string>>;
  stickyFooterCtaBg: string;
  setStickyFooterCtaBg: Dispatch<SetStateAction<string>>;
  stickyFooterCtaFg: string;
  setStickyFooterCtaFg: Dispatch<SetStateAction<string>>;
};

export const ProductFormCtaStickySection = memo(function ProductFormCtaStickySection({
  ctaBannerBgColor,
  setCtaBannerBgColor,
  ctaBannerBgImageUrl,
  setCtaBannerBgImageUrl,
  uploadingCtaBanner,
  ctaBannerOverlayPct,
  setCtaBannerOverlayPct,
  uploadCtaBannerImage,
  stickyFooterShowTimer,
  setStickyFooterShowTimer,
  stickyFooterEndsAt,
  setStickyFooterEndsAt,
  stickyFooterTimerLabelAr,
  setStickyFooterTimerLabelAr,
  stickyFooterTimerLabelFr,
  setStickyFooterTimerLabelFr,
  stickyFooterSavingsAr,
  setStickyFooterSavingsAr,
  stickyFooterSavingsFr,
  setStickyFooterSavingsFr,
  stickyFooterBarBg,
  setStickyFooterBarBg,
  stickyFooterBadgeBg,
  setStickyFooterBadgeBg,
  stickyFooterTimerBoxBg,
  setStickyFooterTimerBoxBg,
  stickyFooterTimerDigit,
  setStickyFooterTimerDigit,
  stickyFooterCtaBg,
  setStickyFooterCtaBg,
  stickyFooterCtaFg,
  setStickyFooterCtaFg,
}: CtaStickyProps) {
  return (
    <>
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
    </>
  );
});

type FeaturesSectionProps = {
  featureRows: FeatureRow[];
  setFeatureRows: Dispatch<SetStateAction<FeatureRow[]>>;
};

export const ProductFormFeaturesSection = memo(function ProductFormFeaturesSection({
  featureRows,
  setFeatureRows,
}: FeaturesSectionProps) {
  return (
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
                className="admin-btn-ghost !min-h-[44px] !px-3 !text-xs disabled:opacity-40"
                onClick={() => setFeatureRows((prev) => moveAt(prev, i, -1))}
                disabled={i === 0}
              >
                {a.productForm.moveUp}
              </button>
              <button
                type="button"
                className="admin-btn-ghost !min-h-[44px] !px-3 !text-xs disabled:opacity-40"
                onClick={() => setFeatureRows((prev) => moveAt(prev, i, 1))}
                disabled={i === featureRows.length - 1}
              >
                {a.productForm.moveDown}
              </button>
              <button
                type="button"
                className="admin-btn-ghost !min-h-[44px] !border-red-500/30 !px-3 !text-xs !text-red-300"
                onClick={() => setFeatureRows((prev) => prev.filter((_, j) => j !== i))}
              >
                {a.productForm.removeItem}
              </button>
            </div>
          </div>
        ))}
      </div>
      {featureRows.length === 0 ? <p className="text-xs text-[var(--muted)]">—</p> : null}
    </section>
  );
});

type TestimonialsSectionProps = {
  testimonials: TestimonialDraft[];
  setTestimonials: Dispatch<SetStateAction<TestimonialDraft[]>>;
  uploadingTestimonialId: string | null;
  uploadTestimonialImage: (testimonialId: string, file: File) => Promise<void>;
};

export const ProductFormTestimonialsSection = memo(function ProductFormTestimonialsSection({
  testimonials,
  setTestimonials,
  uploadingTestimonialId,
  uploadTestimonialImage,
}: TestimonialsSectionProps) {
  return (
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
                onClick={() => setTestimonials((prev) => moveAt(prev, i, -1))}
                disabled={i === 0}
              >
                {a.productForm.moveUp}
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline disabled:opacity-40"
                onClick={() => setTestimonials((prev) => moveAt(prev, i, 1))}
                disabled={i === testimonials.length - 1}
              >
                {a.productForm.moveDown}
              </button>
              <button
                type="button"
                className="text-xs text-red-600 underline dark:text-red-400"
                onClick={() => setTestimonials((prev) => prev.filter((_, j) => j !== i))}
              >
                {a.productForm.removeItem}
              </button>
            </div>
          </div>
        ))}
      </div>
      {testimonials.length === 0 ? <p className="text-xs text-[var(--muted)]">—</p> : null}
    </section>
  );
});

type FaqsSectionProps = {
  faqs: FaqDraft[];
  setFaqs: Dispatch<SetStateAction<FaqDraft[]>>;
};

export const ProductFormFaqsSection = memo(function ProductFormFaqsSection({
  faqs,
  setFaqs,
}: FaqsSectionProps) {
  return (
    <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{a.productForm.faqSection}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.faqHintBilingual}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setFaqs((f) => [...f, { id: newRowId(), q_ar: "", q_fr: "", a_ar: "", a_fr: "" }])
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
      {faqs.length === 0 ? <p className="text-xs text-[var(--muted)]">—</p> : null}
    </section>
  );
});
