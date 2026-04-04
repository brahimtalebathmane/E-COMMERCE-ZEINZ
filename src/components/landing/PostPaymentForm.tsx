"use client";

import { useMemo, useState } from "react";
import type { FormFieldConfig, ProductRow } from "@/types";
import { normalizeFormFields } from "@/lib/form-fields";
import { trackPurchase } from "@/components/MetaPixel";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateErrorMessage } from "@/lib/translate-error";
import { CURRENCY_CODE } from "@/lib/currency";

type Props = {
  product: ProductRow;
  orderId: string;
  completionToken: string;
  onDone?: () => void;
  /** When true, omit outer card chrome (e.g. inside a modal shell). */
  embedded?: boolean;
};

export function PostPaymentForm({
  product,
  orderId,
  completionToken,
  onDone,
  embedded = false,
}: Props) {
  const { t, locale, dir } = useLanguage();
  const fields = useMemo(
    () => normalizeFormFields(product.form_fields),
    [product.form_fields],
  );

  const hasRequired = fields.some((f) => f.required);
  const hasOptional = fields.some((f) => !f.required);

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
        const msg = json.error ?? "Upload failed";
        throw new Error(translateErrorMessage(locale, msg));
      }
      if (json.storage_path) {
        setField(field.id, json.storage_path);
        toast.success(t("postPayment.fileUploaded"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("postPayment.uploadFailed"));
    } finally {
      setUploading(null);
    }
  }

  function validate(): string | null {
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.id];
      if (f.type === "file") {
        if (!v) return t("postPayment.uploadField", { label: f.label });
      } else if (!v || !String(v).trim()) {
        return t("postPayment.fillField", { label: f.label });
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
        const msg = json.error ?? "Could not save order";
        throw new Error(translateErrorMessage(locale, msg));
      }

      const order = json.order;
      const p = order?.products;
      const prod = Array.isArray(p) ? p[0] : p;
      if (prod?.name) {
        trackPurchase({
          value: Number(order!.total_price),
          currency: CURRENCY_CODE,
          content_name: prod.name,
          content_ids: [order!.product_id],
          content_type: "product",
        });
      }

      toast.success(t("postPayment.orderConfirmed"));
      setFinished(true);
      onDone?.();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("postPayment.confirmFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (finished) {
    return (
      <div
        className={
          embedded
            ? "rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8"
            : "rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8"
        }
        dir={dir}
      >
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {t("postPayment.thankYouTitle")}
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("postPayment.thankYouBody")}
        </p>
      </div>
    );
  }

  const title =
    product.form_title?.trim() || t("postPayment.defaultTitle");

  return (
    <div
      className={
        embedded
          ? "p-0"
          : "rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 shadow-sm sm:p-6"
      }
      dir={dir}
    >
      <h3 className="text-start text-lg font-semibold text-[var(--foreground)] sm:text-xl">
        {title}
      </h3>
      {fields.length > 0 ? (
        <p className="mt-3 text-start text-xs text-[var(--muted)] sm:text-sm">
          {hasRequired && hasOptional
            ? t("postPayment.formLegend")
            : hasRequired
              ? t("postPayment.formLegendRequiredOnly")
              : t("postPayment.formLegendOptionalOnly")}
        </p>
      ) : null}
      <div className="mt-6 space-y-6">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-start text-sm font-medium text-[var(--foreground)] sm:text-base">
              <span>{field.label}</span>
              {field.required ? (
                <>
                  <span className="text-red-500" aria-hidden>
                    {" "}
                    *
                  </span>
                  <span className="sr-only"> {t("postPayment.requiredField")}</span>
                </>
              ) : (
                <span className="ms-1 font-normal text-[var(--muted)]">
                  ({t("postPayment.fieldOptional")})
                </span>
              )}
            </label>
            <div className="mt-2">
              {field.type === "text" && (
                <input
                  className="store-input"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  required={field.required}
                  aria-required={field.required}
                />
              )}
              {field.type === "email" && (
                <input
                  type="email"
                  className="store-input"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  required={field.required}
                  aria-required={field.required}
                />
              )}
              {field.type === "link" && (
                <input
                  type="url"
                  className="store-input"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  placeholder={t("postPayment.placeholderUrl")}
                  required={field.required}
                  aria-required={field.required}
                />
              )}
              {field.type === "textarea" && (
                <textarea
                  rows={4}
                  className="store-textarea"
                  value={values[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  required={field.required}
                  aria-required={field.required}
                />
              )}
              {field.type === "file" && (
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploading === field.id}
                    aria-required={field.required}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFieldFile(field, f);
                    }}
                    className="store-file-input"
                  />
                  {uploading === field.id ? (
                    <p className="text-start text-xs text-[var(--muted)]">
                      {t("postPayment.uploading")}
                    </p>
                  ) : null}
                  {values[field.id] ? (
                    <p className="text-start text-xs text-green-700 dark:text-green-400">
                      {t("postPayment.savedSecure")}
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
        className="store-btn-primary mt-8 rounded-xl"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            {t("postPayment.confirming")}
          </span>
        ) : (
          t("postPayment.confirmOrder")
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-foreground)] border-t-transparent"
      aria-hidden
    />
  );
}
