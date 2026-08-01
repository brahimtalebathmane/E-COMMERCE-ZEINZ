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
import { trackLead } from "@/components/MetaPixel";
import { unregisterLegacyRootSerwist } from "@/lib/legacy-serwist-cleanup";
import { storeOrderSuccessClientSession } from "@/lib/orders/order-success-session-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
import { formatMoney } from "@/lib/currency";
import { PhoneCountryInput } from "@/components/landing/PhoneCountryInput";
import { countryNameFromCode } from "@/lib/countries";
import { isValidPhoneNumber, parsePhoneNumberWithError } from "libphonenumber-js";
import type { Country } from "react-phone-number-input";

type Props = {
  product: ProductRow;
  open: boolean;
  onClose: () => void;
  /** Country-specific pixel (from countries.meta_pixel_id_public); falls back to env when unset. */
  metaPixelIdPublic?: string | null;
  /** Resolved from the product's own country (countries.currency) — not products.affiliate_currency, which is a legacy free-text field that can hold non-ISO values. */
  currency?: string;
};

/** Order form for affiliate (COD Partner) landing pages: name, phone, full address, city. */
export function AffiliateOrderFormModal({
  product,
  open,
  onClose,
  metaPixelIdPublic,
  currency,
}: Props) {
  const { locale, dir, t } = useLanguage();
  const router = useRouter();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);
  const currencyCode = currency || "USD";
  const defaultCountry = (product.affiliate_country as Country | null) || "US";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false, address: false, city: false });
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

  const nameError = useMemo(() => {
    if (!touched.name && !busy) return null;
    return name.trim() ? null : t("orderForm.nameRequired");
  }, [name, touched.name, busy, t]);

  const phoneError = useMemo(() => {
    if (!touched.phone && !busy) return null;
    if (!phone.trim()) return t("orderForm.phoneRequired");
    if (!isValidPhoneNumber(phone.trim())) return t("orderForm.phoneInvalid");
    return null;
  }, [phone, touched.phone, busy, t]);

  const addressError = useMemo(() => {
    if (!touched.address && !busy) return null;
    return address.trim() ? null : t("orderForm.addressRequired");
  }, [address, touched.address, busy, t]);

  const cityError = useMemo(() => {
    if (!touched.city && !busy) return null;
    return city.trim() ? null : t("orderForm.cityRequired");
  }, [city, touched.city, busy, t]);

  function reset() {
    setName("");
    setPhone("");
    setAddress("");
    setCity("");
    setBusy(false);
    setTouched({ name: false, phone: false, address: false, city: false });
  }

  async function submit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (submitLockRef.current || busy) return;
    setTouched({ name: true, phone: true, address: true, city: true });

    const n = name.trim();
    const phoneE164 = phone.trim();
    const addr = address.trim();
    const cityVal = city.trim();
    if (!n || !addr || !cityVal) return;
    if (!phoneE164 || !isValidPhoneNumber(phoneE164)) return;

    submitLockRef.current = true;
    setBusy(true);
    try {
      const generatedMetaEventId = ensureMetaFunnelSession(product.id);
      if (!generatedMetaEventId) {
        throw new Error(t("orderForm.sessionError"));
      }

      // Country submitted with the order follows whatever the customer
      // picked in the phone country selector (defaults from the product's
      // target country, changeable — same selector drives both).
      let submittedCountry = product.affiliate_country ?? "";
      try {
        const parsed = parsePhoneNumberWithError(phoneE164);
        if (parsed.country) {
          submittedCountry = countryNameFromCode(parsed.country);
        }
      } catch {
        // Keep the product default if parsing somehow fails post-validation.
      }

      const leadValue =
        product.discount_price != null ? Number(product.discount_price) : Number(product.price);

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
          affiliate_address: addr,
          affiliate_city: cityVal,
          affiliate_country: submittedCountry,
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
        throw new Error(
          "error" in json ? json.error ?? t("orderForm.submitFailed") : t("orderForm.submitFailed"),
        );
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

      queueMetaPendingLead({
        value: leadValue,
        currency: currencyCode,
        eventId: leadEventId,
        orderId: json.order_id,
        productId: product.id,
        productName: copy.name,
        phone: phoneE164,
        customerName: n,
        pixelId: metaPixelIdPublic,
      });

      await trackLead({
        value: leadValue,
        currency: currencyCode,
        eventId: leadEventId,
        orderId: json.order_id,
        productId: product.id,
        productName: copy.name,
        phone: phoneE164,
        customerName: n,
        pixelId: metaPixelIdPublic,
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

  const originalPrice = Number(product.price);
  const discountedPrice = product.discount_price != null ? Number(product.discount_price) : null;
  const hasDiscount = discountedPrice != null && discountedPrice < originalPrice;
  const priceValue = hasDiscount ? discountedPrice : originalPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 [backdrop-filter:blur(4px)] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t("orderForm.close")}
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
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--accent-muted)]/60 bg-[var(--card)] px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              {t("orderForm.title")}
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
            aria-label={t("orderForm.close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent-muted)] bg-[var(--background)] text-[var(--muted)] transition hover:bg-[var(--accent-muted)]/30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6">
          <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-[var(--accent-muted)] bg-[linear-gradient(135deg,var(--background)_0%,var(--card)_100%)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--muted)]">{t("orderForm.priceLabel")}</span>
            <div className="text-end">
              <div className="flex items-baseline justify-end gap-2">
                {hasDiscount ? (
                  <span
                    className="text-xl font-black tabular-nums tracking-tight text-[var(--muted)] line-through decoration-[var(--muted)]/70"
                    dir="ltr"
                  >
                    {formatMoney(originalPrice, currencyCode)}
                  </span>
                ) : null}
                <span className="text-xl font-black tabular-nums tracking-tight text-[var(--accent)]" dir="ltr">
                  {formatMoney(priceValue, currencyCode)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                {t("orderForm.nameLabel")} <span className="text-red-500">*</span>
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
                {t("orderForm.phoneNumberLabel")} <span className="text-red-500">*</span>
              </label>
              <div className="mt-2">
                <PhoneCountryInput
                  value={phone}
                  onChange={setPhone}
                  defaultCountry={defaultCountry}
                  onFocus={() => touchMetaFunnelActivityThrottled(product.id)}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  ariaInvalid={Boolean(phoneError)}
                  placeholder={t("orderForm.phonePlaceholder")}
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

            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                {t("orderForm.cityLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                className="store-input mt-2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onFocus={() => touchMetaFunnelActivityThrottled(product.id)}
                onBlur={() => setTouched((p) => ({ ...p, city: true }))}
                placeholder={t("orderForm.cityPlaceholder")}
                aria-invalid={Boolean(cityError)}
              />
              {cityError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <span aria-hidden>⚠</span>
                  {cityError}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                {t("orderForm.addressLabel")} <span className="text-red-500">*</span>
              </label>
              <textarea
                className="store-textarea mt-2"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={() => touchMetaFunnelActivityThrottled(product.id)}
                onBlur={() => setTouched((p) => ({ ...p, address: true }))}
                placeholder={t("orderForm.addressPlaceholder")}
                aria-invalid={Boolean(addressError)}
              />
              {addressError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <span aria-hidden>⚠</span>
                  {addressError}
                </p>
              ) : null}
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
                  {t("orderForm.submitting")}
                </>
              ) : (
                t("orderForm.submit")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
