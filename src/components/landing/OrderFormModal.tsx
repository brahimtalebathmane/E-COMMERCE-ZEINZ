"use client";

import type { ProductRow } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import {
  clearMetaSessionEventId,
  ensureMetaFunnelSession,
  touchMetaFunnelActivityThrottled,
} from "@/lib/meta-client";
import { queueMetaPendingLead, resolveLeadEventId } from "@/lib/meta-lead-client";
import { unregisterLegacyRootSerwist } from "@/lib/legacy-serwist-cleanup";
import { storeOrderSuccessClientSession } from "@/lib/orders/order-success-session-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { formatPrice } from "@/lib/currency";

type Props = {
  product: ProductRow;
  open: boolean;
  onClose: () => void;
};

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function validateMauritaniaLocalPhone(
  localDigits: string,
  t: (key: string) => string,
): string | null {
  const d = onlyDigits(localDigits);
  if (d.length !== 8) return t("orderForm.phoneLength");
  const first = d[0];
  if (first !== "2" && first !== "3" && first !== "4") {
    return t("orderForm.phonePrefix");
  }
  return null;
}

export function OrderFormModal({ product, open, onClose }: Props) {
  const { locale, dir, t } = useLanguage();
  const router = useRouter();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);

  const [name, setName] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<{ name: boolean; phone: boolean }>({
    name: false,
    phone: false,
  });
  // Synchronous lock: blocks a second tap before React re-renders `busy`.
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => touchMetaFunnelActivityThrottled(product.id);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        touchMetaFunnelActivityThrottled(product.id);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open, product.id]);

  const phoneError = useMemo(() => {
    if (!touched.phone && !busy) return null;
    if (!phoneLocal.trim()) return t("orderForm.phoneRequired");
    const d = onlyDigits(phoneLocal);
    if (d.length !== 8) return t("orderForm.phoneLength");
    const first = d[0];
    if (first !== "2" && first !== "3" && first !== "4") {
      return t("orderForm.phonePrefix");
    }
    return null;
  }, [phoneLocal, touched.phone, busy, t]);

  const nameError = useMemo(() => {
    if (!touched.name && !busy) return null;
    if (!name.trim()) return t("orderForm.nameRequired");
    return null;
  }, [name, touched.name, busy, t]);

  function reset() {
    setName("");
    setPhoneLocal("");
    setBusy(false);
    setTouched({ name: false, phone: false });
  }

  async function submit(e?: React.SyntheticEvent) {
    e?.preventDefault();

    if (submitLockRef.current || busy) return;
    setTouched({ name: true, phone: true });

    const n = name.trim();
    const local = onlyDigits(phoneLocal.trim());
    const phoneErr = validateMauritaniaLocalPhone(local, t);
    if (!n) return;
    if (phoneErr) return;

    submitLockRef.current = true;
    setBusy(true);
    try {
      // Same funnel session id as InitiateCheckout — shared verbatim with CAPI via meta_event_id.
      const generatedMetaEventId = ensureMetaFunnelSession(product.id);
      if (!generatedMetaEventId) {
        throw new Error(t("orderForm.sessionError"));
      }
      const phoneE164 = `+222${local}`;
      const leadValue =
        product.discount_price != null
          ? Number(product.discount_price)
          : Number(product.price);

      const eventSourceUrl = typeof window !== "undefined" ? window.location.href : null;
      const metaCookies = getMetaBrowserCookies();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          product_id: product.id,
          customer_name: n,
          phone: phoneE164,
          meta_event_id: generatedMetaEventId,
          event_source_url: eventSourceUrl,
          meta_fbp: metaCookies.fbp,
          meta_fbc: metaCookies.fbc,
        }),
      });

      const json = (await res.json()) as
        | {
            success: true;
            order_id: string;
            meta_event_id: string;
            total_price: number;
            completion_token?: string;
            action_token?: string;
          }
        | { error?: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error ?? t("orderForm.submitFailed") : t("orderForm.submitFailed"));
      }

      if (!("success" in json) || !json.order_id) {
        throw new Error(t("orderForm.submitFailed"));
      }

      const leadEventId = resolveLeadEventId({
        orderId: json.order_id,
        metaEventId: json.meta_event_id,
      });

      if (json.completion_token && json.action_token) {
        storeOrderSuccessClientSession(json.order_id, {
          completionToken: json.completion_token,
          actionToken: json.action_token,
        });
      }

      // Queue Lead for order-success — Pixel first, then CAPI with same funnel event_id.
      queueMetaPendingLead({
        value: leadValue,
        currency: "MRU",
        eventId: leadEventId,
        orderId: json.order_id,
        productId: product.id,
        productName: copy.name,
        phone: phoneE164,
        customerName: n,
      });

      clearMetaSessionEventId(product.id);

      onClose();

      const qs = new URLSearchParams({
        order_id: json.order_id,
        product_id: product.id,
        total_price: String(json.total_price ?? ""),
      });
      await unregisterLegacyRootSerwist();
      router.push(`/order-success?${qs.toString()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("orderForm.submitError"));
      submitLockRef.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;

  const title = t("orderForm.title");
  const nameLabel = t("orderForm.nameLabel");
  const closeLabel = t("orderForm.close");
  const submitLabel = t("orderForm.submit");
  const submittingLabel = t("orderForm.submitting");
  const codNote = t("orderForm.codNote");
  const priceLabel = t("orderForm.priceLabel");
  const freeShippingLabel = t("orderForm.freeShipping");

  const originalPrice = Number(product.price);
  const discountedPrice =
    product.discount_price != null ? Number(product.discount_price) : null;
  const hasDiscount =
    discountedPrice != null && discountedPrice < originalPrice;
  const priceValue = hasDiscount ? discountedPrice : originalPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 [backdrop-filter:blur(4px)] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={closeLabel}
        onClick={() => {
          reset();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="buy-modal-step-panel relative max-h-[min(94dvh,760px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-[var(--accent-muted)] bg-[var(--card)] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-start shadow-[0_-20px_60px_rgba(0,0,0,0.35)] sm:rounded-3xl sm:pb-6 sm:shadow-2xl"
        dir={dir}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--accent-muted)]/60 bg-[var(--card)] px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              {title}
            </p>
            <h2 className="mt-1 truncate text-lg font-extrabold leading-snug text-[var(--foreground)] sm:text-xl">
              {copy.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label={closeLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent-muted)] bg-[var(--background)] text-[var(--muted)] transition hover:bg-[var(--accent-muted)]/30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6">
          {/* Price summary */}
          <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-[var(--accent-muted)] bg-[linear-gradient(135deg,var(--background)_0%,var(--card)_100%)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--muted)]">{priceLabel}</span>
            <div className="text-end">
              <div className="flex items-baseline justify-end gap-2">
                {hasDiscount ? (
                  <span
                    className="text-xl font-black tabular-nums tracking-tight text-[var(--muted)] line-through decoration-[var(--muted)]/70"
                    dir="ltr"
                  >
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
                <span
                  className="text-xl font-black tabular-nums tracking-tight text-[var(--accent)]"
                  dir="ltr"
                >
                  {formatPrice(priceValue)}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                {freeShippingLabel}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                {nameLabel} <span className="text-red-500">*</span>
              </label>
              <input
                className="store-input mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => touchMetaFunnelActivityThrottled(product.id)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                autoComplete="name"
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                  <span aria-hidden>⚠</span>
                  {nameError}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                {t("orderForm.whatsappNumber")} <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 flex items-stretch gap-2" dir="ltr">
                <span
                  className="inline-flex items-center rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-muted)]/30 px-3 font-mono text-sm font-semibold text-[var(--foreground)]"
                >
                  +222
                </span>
                <input
                  className="store-input min-w-0 flex-1 text-start font-mono tabular-nums"
                  value={phoneLocal}
                  onChange={(e) => {
                    const next = onlyDigits(e.target.value);
                    setPhoneLocal(next.slice(0, 8));
                  }}
                  onFocus={() => touchMetaFunnelActivityThrottled(product.id)}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="2XXXXXXX"
                  aria-invalid={Boolean(phoneError)}
                />
              </div>
              {phoneError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <span aria-hidden>⚠</span>
                  {phoneError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-[var(--muted)]">{t("orderForm.phoneHint")}</p>
              )}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={(e) => void submit(e)}
              className="store-btn-primary mt-1 w-full text-base font-bold disabled:opacity-60"
            >
              {busy ? (
                <>
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
                  </svg>
                  {submittingLabel}
                </>
              ) : (
                submitLabel
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-[var(--muted)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              {codNote}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

