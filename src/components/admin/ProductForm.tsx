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
import { useState } from "react";

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

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
  const [featuresText, setFeaturesText] = useState(
    (initial?.features ?? []).join("\n"),
  );
  const [galleryText, setGalleryText] = useState(
    (initial?.gallery ?? []).join("\n"),
  );
  const [testimonialsJson, setTestimonialsJson] = useState(
    JSON.stringify(initial?.testimonials ?? [], null, 2),
  );
  const [faqsJson, setFaqsJson] = useState(
    JSON.stringify(initial?.faqs ?? [], null, 2),
  );
  const [metaPixel, setMetaPixel] = useState(initial?.meta_pixel_id ?? "");
  const [formTitle, setFormTitle] = useState(initial?.form_title ?? "");
  const [formFields, setFormFields] = useState<FormFieldConfig[]>(
    initial?.form_fields ?? [],
  );
  const [oldSlugsText, setOldSlugsText] = useState(
    (initial?.old_slugs ?? []).join("\n"),
  );

  function buildPayload(): ProductPayload {
    const testimonials = parseJsonArray<Testimonial>(testimonialsJson, []);
    const faqs = parseJsonArray<FAQ>(faqsJson, []);
    const discountPrice =
      discount.trim() === "" ? null : Number.parseFloat(discount);
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
      features: linesToList(featuresText),
      gallery: linesToList(galleryText),
      testimonials,
      faqs,
      meta_pixel_id: metaPixel.trim() || null,
      form_title: formTitle,
      form_fields: formFields,
      old_slugs: linesToList(oldSlugsText),
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
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8 text-start">
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
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.features}</label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.gallery}</label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={galleryText}
            onChange={(e) => setGalleryText(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.testimonialsJson}</label>
          <textarea
            rows={6}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 font-mono text-xs"
            value={testimonialsJson}
            onChange={(e) => setTestimonialsJson(e.target.value)}
            dir="ltr"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {a.productForm.exampleLabel}:{" "}
            <code className="rounded bg-[var(--accent-muted)]/50 px-1" dir="ltr">
              {`[{"name":"Alex","quote":"Great"}]`}
            </code>
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">{a.productForm.faqJson}</label>
          <textarea
            rows={6}
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 font-mono text-xs"
            value={faqsJson}
            onChange={(e) => setFaqsJson(e.target.value)}
            dir="ltr"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {a.productForm.exampleLabel}:{" "}
            <code className="rounded bg-[var(--accent-muted)]/50 px-1" dir="ltr">
              {`[{"q":"Shipping?","a":"2-day"}]`}
            </code>
          </p>
        </div>
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
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">{a.productForm.legacySlugs}</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
              value={oldSlugsText}
              onChange={(e) => setOldSlugsText(e.target.value)}
            />
          </div>
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
