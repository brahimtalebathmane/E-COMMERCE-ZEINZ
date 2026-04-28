"use client";

import type { ProductRow } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import {
  syncMetaPixelAdvancedMatching,
  trackLead,
} from "@/components/MetaPixel";
import {
  buildMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
} from "@/lib/meta-pixel-advanced-matching";
import {
  clearMetaSessionEventId,
  ensureMetaFunnelSession,
  touchMetaFunnelActivityThrottled,
} from "@/lib/meta-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";

type Props = {
  product: ProductRow;
  open: boolean;
  onClose: () => void;
};

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function validateMauritaniaLocalPhone(localDigits: string): string | null {
  const d = onlyDigits(localDigits);
  if (d.length !== 8) return "رقم الهاتف يجب أن يكون 8 أرقام";
  const first = d[0];
  if (first !== "2" && first !== "3" && first !== "4") {
    return "رقم الهاتف يجب أن يبدأ بـ 2 أو 3 أو 4";
  }
  return null;
}

export function OrderFormModal({ product, open, onClose }: Props) {
  const { dir, locale, t } = useLanguage();
  const router = useRouter();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);

  const [name, setName] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<{ name: boolean; phone: boolean }>({
    name: false,
    phone: false,
  });

  useEffect(() => {
    if (!open) return;
    const onScroll = () => touchMetaFunnelActivityThrottled();
    const onVis = () => {
      if (document.visibilityState === "visible") touchMetaFunnelActivityThrottled();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open]);

  const phoneError = useMemo(() => {
    if (!touched.phone && !busy) return null;
    if (!phoneLocal.trim()) return "رقم الهاتف مطلوب";
    return validateMauritaniaLocalPhone(phoneLocal);
  }, [phoneLocal, touched.phone, busy]);

  const nameError = useMemo(() => {
    if (!touched.name && !busy) return null;
    if (!name.trim()) return "الاسم مطلوب";
    return null;
  }, [name, touched.name, busy]);

  function reset() {
    setName("");
    setPhoneLocal("");
    setBusy(false);
    setTouched({ name: false, phone: false });
  }

  async function submit() {
    setTouched({ name: true, phone: true });

    const n = name.trim();
    const local = onlyDigits(phoneLocal.trim());
    const phoneErr = validateMauritaniaLocalPhone(local);
    if (!n) return;
    if (phoneErr) return;

    setBusy(true);
    try {
      const eventId = ensureMetaFunnelSession();
      const eventSourceUrl = typeof window !== "undefined" ? window.location.href : null;
      const metaCookies = getMetaBrowserCookies();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          customer_name: n,
          phone: `+222${local}`,
          meta_event_id: eventId,
          event_source_url: eventSourceUrl,
          meta_fbp: metaCookies.fbp,
          meta_fbc: metaCookies.fbc,
        }),
      });

      const json = (await res.json()) as
        | { success: true; order_id: string; total_price: number }
        | { error?: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error ?? "تعذر إرسال الطلب" : "تعذر إرسال الطلب");
      }

      reset();
      onClose();
      if (!("success" in json) || !json.order_id) {
        throw new Error("تعذر إرسال الطلب");
      }

      const phoneE164 = `+222${local}`;
      const am = buildMetaPixelAdvancedMatching({
        phone: phoneE164,
        customerName: n,
      });
      const pid = product.meta_pixel_id?.trim();
      if (am && pid) {
        try {
          sessionStorage.setItem(metaPixelAmStorageKey(pid), JSON.stringify(am));
        } catch {
          // ignore
        }
        syncMetaPixelAdvancedMatching(pid, {
          phone: phoneE164,
          customerName: n,
        });
      }

      // Keep browser Lead for marketing robustness; server sends Lead too with same event id.
      trackLead({
        value: Number(json.total_price ?? product.discount_price ?? product.price),
        currency: "MRU",
        eventId,
      });

      try {
        clearMetaSessionEventId();
      } catch {
        // ignore
      }

      const qs = new URLSearchParams({
        order_id: json.order_id,
        product_id: product.id,
        total_price: String(json.total_price ?? ""),
      });
      router.push(`/order-success?${qs.toString()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={() => {
          reset();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 shadow-xl sm:p-6"
        dir={dir}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold sm:text-xl">طلب شراء</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{copy.name}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--accent-muted)]/20"
          >
            إغلاق
          </button>
        </div>

        <div className="mt-6 space-y-4 sm:mt-8">
          <div>
            <label className="block text-sm font-medium">
              الاسم الكامل <span className="text-red-500">*</span>
            </label>
            <input
              className="store-input mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => touchMetaFunnelActivityThrottled()}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              autoComplete="name"
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nameError}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">
              {t("orderForm.whatsappNumber")}{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 flex items-stretch gap-2" dir="ltr">
              <span className="inline-flex items-center rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-muted)]/30 px-3 text-sm font-mono text-[var(--foreground)]">
                +222
              </span>
              <input
                className="store-input flex-1"
                value={phoneLocal}
                onChange={(e) => {
                  const next = onlyDigits(e.target.value);
                  setPhoneLocal(next.slice(0, 8));
                }}
                onFocus={() => touchMetaFunnelActivityThrottled()}
                onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="XXXXXXXX"
                aria-invalid={Boolean(phoneError)}
              />
            </div>
            {phoneError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phoneError}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">
                أدخل 8 أرقام تبدأ بـ 2 أو 3 أو 4
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="store-btn-primary mt-2 w-full rounded-xl font-bold shadow-lg shadow-[var(--accent)]/25 disabled:opacity-60"
          >
            {busy ? "جارٍ الإرسال..." : "طلب"}
          </button>
        </div>
      </div>
    </div>
  );
}

