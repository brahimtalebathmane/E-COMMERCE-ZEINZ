"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  createResearchProductAction,
  deleteProductAction,
  updateResearchProductAction,
} from "@/app/admin/(dashboard)/products/actions";
import type { ResearchProductPayload } from "@/app/admin/(dashboard)/products/research-types";
import { adminAr as a } from "@/locales/admin-ar";
import type { ProductRow, ProductSourcingType } from "@/types";
import { codMarginPercent } from "@/lib/product-pipeline";
import { formatPrice } from "@/lib/currency";

type Props = {
  mode: "create" | "edit";
  initial?: ProductRow;
};

export function ResearchProductForm({ mode, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState(initial?.name_ar ?? "");
  const [mediaUrl, setMediaUrl] = useState(initial?.media_url ?? "");
  const [mediaType, setMediaType] = useState<"image" | "video">(
    initial?.media_type ?? "image",
  );
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [costPrice, setCostPrice] = useState(
    initial?.cost_price != null ? String(initial.cost_price) : "",
  );
  const [sourcingType, setSourcingType] = useState<ProductSourcingType>(
    initial?.sourcing_type ?? "local",
  );
  const [sourcingLink, setSourcingLink] = useState(initial?.sourcing_link ?? "");
  const [uploading, setUploading] = useState(false);

  const priceNum = Number.parseFloat(price);
  const costNum = Number.parseFloat(costPrice);
  const marginPct = codMarginPercent(
    Number.isFinite(priceNum) ? priceNum : 0,
    null,
    Number.isFinite(costNum) ? costNum : null,
  );

  const uploadMainImage = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const response = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: fd,
      });
      const payload = (await response.json()) as { signedUrl?: string; error?: string };
      if (!response.ok || !payload.signedUrl) {
        throw new Error(payload.error || "فشل رفع الصورة.");
      }
      setMediaUrl(payload.signedUrl);
      setMediaType("image");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الصورة.");
    } finally {
      setUploading(false);
    }
  }, []);

  function buildPayload(): ResearchProductPayload {
    return {
      name_ar: nameAr.trim(),
      media_url: mediaUrl.trim(),
      media_type: mediaType,
      price: Number.parseFloat(price),
      cost_price: Number.parseFloat(costPrice),
      sourcing_type: sourcingType,
      sourcing_link: sourcingLink.trim(),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (mode === "create") {
        await createResearchProductAction(payload);
      } else if (initial) {
        await updateResearchProductAction(initial.id, payload);
      }
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : a.researchForm.failedSave);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!initial || mode !== "edit") return;
    if (!confirm(a.researchForm.deleteConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteProductAction(initial.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : a.researchForm.failedDelete);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-6 text-start" dir="rtl">
      <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        <h2 className="text-base font-bold">
          {mode === "create" ? a.researchForm.title : a.editResearch.title}
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{a.researchForm.hint}</p>
        {mode === "edit" && initial ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {a.productForm.slugFixed}{" "}
            <code className="font-mono" dir="ltr">
              {initial.slug}
            </code>
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-medium">{a.researchForm.productName}</label>
        <input
          required
          className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">{a.researchForm.mainImage}</label>
        <input
          required
          className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://"
          dir="ltr"
        />
        <input
          type="file"
          accept="image/*"
          className="mt-2 block w-full text-sm file:rounded-lg file:border file:border-[var(--accent-muted)] file:bg-[var(--card)] file:px-3 file:py-2"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadMainImage(f);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{a.researchForm.uploading}</p>
        ) : null}
        {mediaUrl.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt=""
            className="mt-3 h-24 w-24 rounded-lg border border-[var(--accent-muted)] object-cover"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">{a.researchForm.price}</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{a.researchForm.costPrice}</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      {marginPct != null ? (
        <p
          className={`text-sm font-semibold ${
            marginPct > 60 ? "text-emerald-800" : "text-amber-900"
          }`}
          dir="ltr"
        >
          {a.pipeline.marginLabel}: {Math.round(marginPct * 10) / 10}%
          {Number.isFinite(priceNum) ? (
            <span className="ms-2 font-normal text-[var(--muted)]">
              ({formatPrice(priceNum)})
            </span>
          ) : null}
        </p>
      ) : null}

      <div>
        <label className="text-sm font-medium">{a.researchForm.sourcingType}</label>
        <select
          required
          className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
          value={sourcingType}
          onChange={(e) => setSourcingType(e.target.value as ProductSourcingType)}
        >
          <option value="local">{a.productForm.sourcingLocal}</option>
          <option value="import">{a.productForm.sourcingImport}</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">{a.researchForm.sourcingLink}</label>
        <input
          required
          className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
          value={sourcingLink}
          onChange={(e) => setSourcingLink(e.target.value)}
          placeholder="https://"
          dir="ltr"
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
        >
          {busy
            ? a.researchForm.saving
            : mode === "create"
              ? a.researchForm.create
              : a.researchForm.saveChanges}
        </button>
        <button
          type="button"
          className="rounded-xl border border-[var(--accent-muted)] px-5 py-2.5 text-sm"
          onClick={() => router.push("/admin/products")}
        >
          {a.researchForm.cancel}
        </button>
        {mode === "edit" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
            className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {a.researchForm.delete}
          </button>
        ) : null}
      </div>
    </form>
  );
}
