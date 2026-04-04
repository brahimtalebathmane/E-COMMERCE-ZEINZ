"use client";

import type { FormFieldConfig, ProductRow, Testimonial, FAQ } from "@/types";
import { FormBuilder } from "@/components/admin/FormBuilder";
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
  const a = next[i];
  const b = next[j];
  if (a === undefined || b === undefined) return arr;
  next[i] = b;
  next[j] = a;
  return next;
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

type TestimonialDraft = Testimonial & { id: string };
type FaqDraft = FAQ & { id: string };

type Props = {
  mode: "create" | "edit";
  initial?: ProductRow;
};

export function ProductForm({ mode, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? "0"));
  const [discount, setDiscount] = useState(
    initial?.discount_price != null ? String(initial.discount_price) : "",
  );
  const [mediaType, setMediaType] = useState<"image" | "video">(
    initial?.media_type ?? "image",
  );
  const [mediaUrl, setMediaUrl] = useState(initial?.media_url ?? "");
  const [features, setFeatures] = useState<string[]>(() =>
    initial?.features?.length ? [...initial.features] : [],
  );
  const [gallery, setGallery] = useState<{ id: string; url: string }[]>(() =>
    initial?.gallery?.length
      ? initial.gallery.map((url, i) => ({ id: `gallery-init-${i}`, url }))
      : [],
  );
  const [testimonials, setTestimonials] = useState<TestimonialDraft[]>(() =>
    initial?.testimonials?.length
      ? initial.testimonials.map((t, i) => ({
          id: `testimonial-init-${i}`,
          name: t.name,
          quote: t.quote,
          role: t.role,
        }))
      : [],
  );
  const [faqs, setFaqs] = useState<FaqDraft[]>(() =>
    initial?.faqs?.length
      ? initial.faqs.map((f, i) => ({
          id: `faq-init-${i}`,
          q: f.q,
          a: f.a,
        }))
      : [],
  );
  const [metaPixel, setMetaPixel] = useState(initial?.meta_pixel_id ?? "");
  const [formTitle, setFormTitle] = useState(initial?.form_title ?? "");
  const [formFields, setFormFields] = useState<FormFieldConfig[]>(
    initial?.form_fields ?? [],
  );
  const [oldSlugs, setOldSlugs] = useState<string[]>(() =>
    initial?.old_slugs?.length ? [...initial.old_slugs] : [],
  );

  function buildPayload(): ProductPayload {
    const discountPrice =
      discount.trim() === "" ? null : Number.parseFloat(discount);
    const cleanedTestimonials = testimonials
      .map((t) => {
        const name = t.name.trim();
        const quote = t.quote.trim();
        const role = t.role?.trim();
        const base: Testimonial = { name, quote };
        if (role) return { ...base, role };
        return base;
      })
      .filter((t) => t.name.length > 0 && t.quote.length > 0);

    const cleanedFaqs = faqs
      .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
      .filter((f) => f.q.length > 0 && f.a.length > 0);

    return {
      name,
      description,
      price: Number.parseFloat(price),
      discount_price:
        discountPrice != null && !Number.isNaN(discountPrice)
          ? discountPrice
          : null,
      media_type: mediaType,
      media_url: mediaUrl,
      features: features.map((s) => s.trim()).filter(Boolean),
      gallery: gallery.map((g) => g.url.trim()).filter(Boolean),
      testimonials: cleanedTestimonials,
      faqs: cleanedFaqs,
      meta_pixel_id: metaPixel.trim() || null,
      form_title: formTitle,
      form_fields: formFields,
      old_slugs: oldSlugs.map((s) => s.trim()).filter(Boolean),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
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
          <label className="text-sm font-medium">{a.productForm.name}</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.description}</label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

        <section className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{a.productForm.features}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.featuresHint}</p>
            </div>
            <button
              type="button"
              onClick={() => setFeatures((f) => [...f, ""])}
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addFeature}
            </button>
          </div>
          <div className="space-y-2">
            {features.map((line, i) => (
              <div
                key={`f-${i}`}
                className="flex flex-col gap-2 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] p-2 sm:flex-row sm:items-center"
              >
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                  value={line}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFeatures((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    });
                  }}
                  placeholder={a.productForm.featurePlaceholder}
                />
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                    onClick={() => setFeatures((prev) => moveAt(prev, i, -1))}
                    disabled={i === 0}
                  >
                    {a.productForm.moveUp}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[var(--accent-muted)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                    onClick={() => setFeatures((prev) => moveAt(prev, i, 1))}
                    disabled={i === features.length - 1}
                  >
                    {a.productForm.moveDown}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
                    onClick={() =>
                      setFeatures((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    {a.productForm.removeItem}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {features.length === 0 ? (
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
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.testimonialsHint}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setTestimonials((t) => [
                  ...t,
                  { id: newRowId(), name: "", quote: "", role: undefined },
                ])
              }
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addTestimonial}
            </button>
          </div>
          <div className="space-y-3">
            {testimonials.map((t, i) => (
              <div
                key={t.id}
                className="space-y-2 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialName}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, name: v };
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">{a.productForm.testimonialRole}</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                      value={t.role ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTestimonials((prev) => {
                          const next = [...prev];
                          const cur = next[i];
                          if (cur) next[i] = { ...cur, role: v || undefined };
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
                    value={t.quote}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTestimonials((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, quote: v };
                        return next;
                      });
                    }}
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
              <p className="mt-1 text-xs text-[var(--muted)]">{a.productForm.faqHint}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setFaqs((f) => [...f, { id: newRowId(), q: "", a: "" }])
              }
              className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
            >
              {a.productForm.addFaq}
            </button>
          </div>
          <div className="space-y-3">
            {faqs.map((item, i) => (
              <div
                key={item.id}
                className="space-y-2 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-3"
              >
                <div>
                  <label className="text-xs text-[var(--muted)]">{a.productForm.faqQuestion}</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                    value={item.q}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, q: v };
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
                    value={item.a}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFaqs((prev) => {
                        const next = [...prev];
                        const cur = next[i];
                        if (cur) next[i] = { ...cur, a: v };
                        return next;
                      });
                    }}
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
          <label className="text-sm font-medium">{a.productForm.formTitle}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <FormBuilder value={formFields} onChange={setFormFields} />
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
          className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
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
