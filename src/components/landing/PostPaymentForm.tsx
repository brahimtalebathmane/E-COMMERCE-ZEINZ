"use client";

import { useMemo, useState } from "react";
import type { FormFieldConfig, ProductRow } from "@/types";
import { trackPurchase } from "@/components/MetaPixel";
import { toast } from "sonner";

type Props = {
  product: ProductRow;
  orderId: string;
  completionToken: string;
  onDone?: () => void;
};

const CURRENCY =
  process.env.NEXT_PUBLIC_PIXEL_CURRENCY?.trim() || "USD";

export function PostPaymentForm({
  product,
  orderId,
  completionToken,
  onDone,
}: Props) {
  const fields = useMemo(
    () => (Array.isArray(product.form_fields) ? product.form_fields : []),
    [product.form_fields],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  function setField(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  async function uploadFieldFile(field: FormFieldConfig, file: File) {
    setUploading(field.id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("order_id", orderId);
      fd.append("completion_token", completionToken);
      fd.append("field_id", field.id);

      const res = await fetch("/api/upload/form-file", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { storage_path?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Upload failed");
      }
      if (json.storage_path) {
        setField(field.id, json.storage_path);
        toast.success("File uploaded");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  function validate(): string | null {
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.id];
      if (f.type === "file") {
        if (!v) return `Please upload: ${f.label}`;
      } else if (!v || !String(v).trim()) {
        return `Please fill: ${f.label}`;
      }
    }
    return null;
  }

  async function handleConfirm() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_token: completionToken,
          form_data: values,
          confirm_purchase: true,
        }),
      });

      const json = (await res.json()) as {
        order?: {
          id: string;
          total_price: number;
          product_id: string;
          products?: { id: string; name: string; slug: string; meta_pixel_id?: string | null };
        };
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Could not save order");
      }

      const order = json.order;
      const p = order?.products;
      const prod = Array.isArray(p) ? p[0] : p;
      if (prod?.name) {
        trackPurchase({
          value: Number(order!.total_price),
          currency: CURRENCY,
          content_name: prod.name,
          content_ids: [order!.product_id],
          content_type: "product",
        });
      }

      toast.success("Order confirmed");
      setFinished(true);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setSubmitting(false);
    }
  }

  if (finished) {
    return (
      <div className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-[var(--foreground)]">
          Thank you — you&apos;re all set
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We received your details. Our team will follow up shortly.
        </p>
      </div>
    );
  }

  const title =
    product.form_title?.trim() || "A few more details to complete your order";

  return (
    <div className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <div className="mt-6 space-y-5">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-[var(--foreground)]">
              {field.label}
              {field.required ? <span className="text-red-500"> *</span> : null}
            </label>
            <div className="mt-1.5">
              {field.type === "text" && (
                <input
                  className="w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                />
              )}
              {field.type === "email" && (
                <input
                  type="email"
                  className="w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                />
              )}
              {field.type === "link" && (
                <input
                  type="url"
                  className="w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  placeholder="https://"
                />
              )}
              {field.type === "textarea" && (
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                />
              )}
              {field.type === "file" && (
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploading === field.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFieldFile(field, f);
                    }}
                    className="text-sm"
                  />
                  {uploading === field.id ? (
                    <p className="text-xs text-[var(--muted)]">Uploading…</p>
                  ) : null}
                  {values[field.id] ? (
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Saved to secure storage
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={submitting || uploading !== null}
        onClick={() => void handleConfirm()}
        className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Confirming…
          </span>
        ) : (
          "Confirm order"
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
      aria-hidden
    />
  );
}
