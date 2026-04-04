"use client";

import { useEffect, useMemo, useState } from "react";

function DirectPaymentLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  const u = url?.trim();
  if (!u) return null;
  if (failed) {
    return (
      <div
        className="h-14 w-14 shrink-0 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)]/90"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={u}
      alt=""
      className="h-14 w-14 shrink-0 rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] object-contain p-1"
      onError={() => setFailed(true)}
    />
  );
}
import type { ProductRow } from "@/types";
import { ORDER_STORAGE_KEY } from "@/lib/constants";
import { toast } from "sonner";
import { PostPaymentForm } from "./PostPaymentForm";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateErrorMessage } from "@/lib/translate-error";
import { formatPrice } from "@/lib/currency";
import { resolveOrderWhatsAppE164Digits } from "@/lib/whatsapp";

async function parseResponseJson(
  res: Response,
): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text.trim()) return {};
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

type Method = {
  id: string;
  label: string;
  account_number: string;
  payment_logo_url: string | null;
  sort_order: number;
};

type Props = {
  product: ProductRow;
  open: boolean;
  onClose: () => void;
};

export function BuyModal({ product, open, onClose }: Props) {
  const { t, locale, dir } = useLanguage();
  const total = useMemo(() => {
    return product.discount_price != null
      ? product.discount_price
      : product.price;
  }, [product]);

  const [methods, setMethods] = useState<Method[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"choose" | "direct" | "form">("choose");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [completionToken, setCompletionToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/payment-methods");
      const json = (await res.json()) as { methods?: Method[] };
      setMethods(json.methods ?? []);
      if (json.methods?.[0]) setSelectedId(json.methods[0].id);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPhase("choose");
      setFile(null);
      setPhone("");
      setAddress("");
      setOrderId(null);
      setCompletionToken(null);
      setBusy(false);
    }
  }, [open]);

  const selected = methods.find((m) => m.id === selectedId);

  async function handlePaySubmit() {
    if (!selected) {
      toast.error(t("buyModal.choosePayment"));
      return;
    }
    if (!file) {
      toast.error(t("buyModal.uploadReceiptRequired"));
      return;
    }

    setBusy(true);
    try {
      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          payment_method: selected.label,
          payment_number: selected.account_number,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const created = await parseResponseJson(createRes);
      if (!createRes.ok) {
        const raw =
          typeof created.error === "string" ? created.error.trim() : "";
        throw new Error(
          raw
            ? translateErrorMessage(locale, raw)
            : t("errors.orderSubmitFailed"),
        );
      }
      const orderId = created.order_id;
      const completionTok = created.completion_token;
      if (
        typeof orderId !== "string" ||
        typeof completionTok !== "string" ||
        !orderId ||
        !completionTok
      ) {
        throw new Error(t("errors.orderSubmitFailed"));
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("order_id", orderId);
      fd.append("completion_token", completionTok);

      const upRes = await fetch("/api/upload/receipt", {
        method: "POST",
        body: fd,
      });
      const uploaded = await parseResponseJson(upRes);
      if (!upRes.ok) {
        const raw =
          typeof uploaded.error === "string" ? uploaded.error.trim() : "";
        throw new Error(
          raw
            ? translateErrorMessage(locale, raw)
            : t("errors.orderSubmitFailed"),
        );
      }
      const storagePath = uploaded.storage_path;
      if (typeof storagePath !== "string" || !storagePath) {
        throw new Error(t("errors.orderSubmitFailed"));
      }

      const patchRes = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_token: completionTok,
          receipt_image_url: storagePath,
        }),
      });
      const patched = await parseResponseJson(patchRes);
      if (!patchRes.ok) {
        const raw =
          typeof patched.error === "string" ? patched.error.trim() : "";
        throw new Error(
          raw
            ? translateErrorMessage(locale, raw)
            : t("errors.orderSubmitFailed"),
        );
      }

      toast.success(t("buyModal.receiptUploaded"));

      const payload = {
        orderId,
        completionToken: completionTok,
        productSlug: product.slug,
      };
      try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota
      }

      setOrderId(orderId);
      setCompletionToken(completionTok);
      setPhase("form");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("errors.somethingWrong");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function whatsappHref() {
    const phoneE164 = resolveOrderWhatsAppE164Digits(product);
    const priceStr = formatPrice(Number(total));
    const text = t("buyModal.whatsappOrderText", {
      name: product.name,
      price: priceStr,
    });
    const encoded = encodeURIComponent(text);
    if (!phoneE164) {
      return `https://wa.me/?text=${encoded}`;
    }
    return `https://wa.me/${phoneE164}?text=${encoded}`;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--card)] p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        dir={dir}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 text-start">
            <h2 className="text-xl font-semibold">{t("buyModal.checkout")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{product.name}</p>
            <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
              {t("buyModal.amountDue", { price: formatPrice(total) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--accent-muted)]"
          >
            {t("buyModal.close")}
          </button>
        </div>

        {phase === "choose" ? (
          <div className="mt-8 flex flex-col gap-3 sm:mt-10">
            <button
              type="button"
              onClick={() => setPhase("direct")}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/25 transition hover:opacity-90"
            >
              {t("buyModal.directPayment")}
            </button>
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noreferrer"
              onClick={() => onClose()}
              className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[var(--accent-muted)] bg-[var(--background)] px-4 py-3.5 text-base font-medium text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/40"
            >
              {t("buyModal.orderViaWhatsApp")}
            </a>
          </div>
        ) : phase === "direct" ? (
          <div className="mt-6 space-y-5">
            <button
              type="button"
              onClick={() => setPhase("choose")}
              className="text-start text-sm font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
            >
              {t("buyModal.backToOptions")}
            </button>

            <div>
              <label className="text-sm font-medium">{t("buyModal.paymentMethod")}</label>
              <select
                className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {selected ? (
              <div className="rounded-xl bg-[var(--accent-muted)]/40 p-4">
                <div className="flex items-start gap-3">
                  <DirectPaymentLogo url={selected.payment_logo_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      {t("buyModal.sendPaymentTo")}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tracking-tight" dir="ltr">
                      {selected.account_number}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-start text-sm text-amber-700 dark:text-amber-300">
                {t("buyModal.noPaymentMethods")}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">{t("buyModal.phone")}</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("buyModal.address")}</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t("buyModal.receiptImage")}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 w-full text-sm"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">{t("buyModal.receiptHint")}</p>
            </div>

            <button
              type="button"
              disabled={busy || !selected}
              onClick={() => void handlePaySubmit()}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("buyModal.processing")}
                </span>
              ) : (
                t("buyModal.uploadReceipt")
              )}
            </button>
          </div>
        ) : orderId && completionToken ? (
          <div className="mt-6">
            <PostPaymentForm
              product={product}
              orderId={orderId}
              completionToken={completionToken}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
