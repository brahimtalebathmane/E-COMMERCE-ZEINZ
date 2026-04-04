"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductRow } from "@/types";
import { ORDER_STORAGE_KEY } from "@/lib/constants";
import { toast } from "sonner";
import { PostPaymentForm } from "./PostPaymentForm";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateErrorMessage } from "@/lib/translate-error";

type Method = {
  id: string;
  label: string;
  account_number: string;
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
  const [transactionReference, setTransactionReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"pay" | "form">("pay");
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
      setPhase("pay");
      setFile(null);
      setTransactionReference("");
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
          transaction_reference: transactionReference.trim() || undefined,
          customer_name: customerName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const created = (await createRes.json()) as {
        order_id?: string;
        completion_token?: string;
        error?: string;
      };
      if (!createRes.ok) {
        const msg = created.error ?? "Could not create order";
        throw new Error(translateErrorMessage(locale, msg));
      }
      if (!created.order_id || !created.completion_token) {
        throw new Error(
          translateErrorMessage(locale, "Invalid server response"),
        );
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("order_id", created.order_id);
      fd.append("completion_token", created.completion_token);

      const upRes = await fetch("/api/upload/receipt", {
        method: "POST",
        body: fd,
      });
      const uploaded = (await upRes.json()) as {
        storage_path?: string;
        error?: string;
      };
      if (!upRes.ok) {
        const msg = uploaded.error ?? "Receipt upload failed";
        throw new Error(translateErrorMessage(locale, msg));
      }

      const patchRes = await fetch(`/api/orders/${created.order_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_token: created.completion_token,
          receipt_image_url: uploaded.storage_path,
        }),
      });
      if (!patchRes.ok) {
        const p = (await patchRes.json()) as { error?: string };
        const msg = p.error ?? "Could not save receipt";
        throw new Error(translateErrorMessage(locale, msg));
      }

      toast.success(t("buyModal.receiptUploaded"));

      const payload = {
        orderId: created.order_id,
        completionToken: created.completion_token,
        productSlug: product.slug,
      };
      try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota
      }

      setOrderId(created.order_id);
      setCompletionToken(created.completion_token);
      setPhase("form");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("errors.somethingWrong");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function whatsappHref() {
    const phoneE164 =
      process.env.NEXT_PUBLIC_WHATSAPP_E164?.replace(/\D/g, "") ?? "";
    const priceStr = `$${Number(total).toFixed(2)}`;
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
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--accent-muted)]"
          >
            {t("buyModal.close")}
          </button>
        </div>

        {phase === "pay" ? (
          <div className="mt-6 space-y-5">
            <div className="flex gap-2">
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--accent-muted)] px-4 py-3 text-sm font-medium hover:bg-[var(--accent-muted)]"
              >
                {t("buyModal.orderViaWhatsApp")}
              </a>
            </div>
            <p className="text-center text-xs text-[var(--muted)]">
              {t("buyModal.orPayDirectly")}
            </p>

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
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {t("buyModal.sendPaymentTo")}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-tight" dir="ltr">
                  {selected.account_number}
                </p>
              </div>
            ) : (
              <p className="text-start text-sm text-amber-700 dark:text-amber-300">
                {t("buyModal.noPaymentMethods")}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">{t("buyModal.yourName")}</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("buyModal.phone")}</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("buyModal.address")}</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">
                {t("buyModal.transactionRef")}
              </label>
              <input
                className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-start text-sm"
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
              />
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
