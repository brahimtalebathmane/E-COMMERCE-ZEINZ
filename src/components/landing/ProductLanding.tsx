"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProductRow } from "@/types";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import { LandingMedia } from "./LandingMedia";
import { useLanguage } from "@/contexts/LanguageContext";
import { OrderFormModal } from "@/components/landing/OrderFormModal";
import { MetaPixel, trackInitiateCheckout } from "@/components/MetaPixel";
import { formatPrice } from "@/lib/currency";
import {
  ensureMetaFunnelSession,
  touchMetaFunnelActivity,
  touchMetaFunnelActivityThrottled,
} from "@/lib/meta-client";

type Props = {
  product: ProductRow;
};

const primaryCtaClass =
  "store-btn-primary rounded-xl px-6 py-2 text-lg font-bold shadow-lg";

function fixedSlots<T>(items: T[], count: number): Array<T | null> {
  if (items.length === 0) return Array.from({ length: count }, () => null);
  return Array.from({ length: count }, (_, i) => items[i] ?? items[i % items.length] ?? null);
}

function statNumber(raw: string): number {
  const m = raw.replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function statSuffix(raw: string): string {
  const m = raw.match(/\+\s*/);
  return m ? "+" : "";
}

function AnimatedCounter({ value }: { value: string }) {
  const target = statNumber(value);
  const suffix = statSuffix(value);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 1300;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <span>
      {current}
      {suffix}
    </span>
  );
}

function FeatureIcon({ feature, color }: { feature: string; color: string }) {
  const keyword = feature.toLowerCase();
  let path =
    "M12 4v16M4 12h16"; // plus
  if (keyword.includes("شحن") || keyword.includes("delivery")) {
    path = "M3 7h10v7H3zM13 10h4l2 3v1h-6zM7 18a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z";
  } else if (keyword.includes("ضمان") || keyword.includes("safe") || keyword.includes("security")) {
    path = "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3zM9 12l2 2 4-4";
  } else if (keyword.includes("طبيعي") || keyword.includes("organic") || keyword.includes("quality")) {
    path = "M12 4c4 0 6 3 6 6 0 5-3 8-6 10-3-2-6-5-6-10 0-3 2-6 6-6zM9 12c2-1 4-3 6-6";
  } else if (keyword.includes("مستخدم") || keyword.includes("client") || keyword.includes("customer")) {
    path = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0";
  }

  return (
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#9bb89a] bg-white">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

export function ProductLanding({ product }: Props) {
  const { dir, locale, setLocale } = useLanguage();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);
  const [open, setOpen] = useState(false);
  const accent = copy.brandColor || "#006B0C";

  const stats = copy.stats;
  const contacts = copy.contactLines;
  const descLines = copy.description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heroTestimonial = copy.testimonials[0] ?? null;
  const testimonialGridItems = fixedSlots(copy.testimonials.slice(1), 4);
  const featureItems = fixedSlots(copy.features, 4);
  const statItems = fixedSlots(stats, 3);
  const faqItems = fixedSlots(copy.faqs, 4);
  const contactItems = fixedSlots(contacts, 3);

  const price = useMemo(() => {
    const original = product.price;
    const discounted = product.discount_price != null ? product.discount_price : null;
    return { original, discounted };
  }, [product]);
  const discountPercent = useMemo(() => {
    if (price.discounted == null || price.original <= 0 || price.discounted >= price.original) return null;
    return Math.round(((price.original - price.discounted) / price.original) * 100);
  }, [price.discounted, price.original]);

  useEffect(() => {
    setLocale(product.default_language ?? "ar");
  }, [product.default_language, setLocale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      ensureMetaFunnelSession();
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, []);

  const openCheckout = () => {
    try {
      touchMetaFunnelActivity();
      trackInitiateCheckout(ensureMetaFunnelSession());
    } catch {
      // ignore
    }
    setOpen(true);
  };

  return (
    <div
      className="mx-auto max-w-[390px] overflow-hidden bg-[#e9f0e7] pb-24 text-[#0f230f]"
      dir={dir}
      style={
        {
          "--accent": accent,
          "--accent-foreground": "#efffed",
          "--accent-muted": "#c2d3bf",
          "--card": "#edf3ea",
          "--muted": "#446143",
        } as CSSProperties
      }
    >
      <MetaPixel pixelId={product.meta_pixel_id} />

      <header className="rounded-b-2xl bg-[#dbe8d9] px-4 pb-4 pt-2 text-center shadow-sm">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#2d4a2d]">
          <span className="rounded-full bg-white px-2 py-1">
            <Image src={copy.logoUrl} alt="logo" width={56} height={24} className="h-5 w-auto object-contain" />
          </span>
          <span>{copy.heroBadge}</span>
        </div>
        <h1 className="line-clamp-2 min-h-[4.5rem] text-3xl font-black leading-tight">{copy.name}</h1>
        {copy.heroSubtitle ? <p className="mt-1 line-clamp-2 min-h-10 text-sm text-[#3f5d3f]">{copy.heroSubtitle}</p> : <p className="mt-1 min-h-10" aria-hidden />}
      </header>

      <section className="px-3 pb-2 pt-4">
        <div className="overflow-hidden rounded-2xl border border-[#7ca67b] bg-white shadow-[0_4px_18px_rgba(13,63,18,0.12)]">
          <LandingMedia product={product} priority />
        </div>
        <div className="mx-2 mt-3 rounded-2xl border border-[#b9cdb9] bg-[#edf5eb] px-4 py-2 text-sm font-bold shadow-sm">
          <div className="flex items-center justify-between text-[#1b3f1f]">
            <span>{price.discounted != null ? formatPrice(price.discounted) : formatPrice(price.original)}</span>
            <span className={price.discounted != null ? "opacity-60 line-through" : "opacity-0"}>
              {formatPrice(price.original)}
            </span>
          </div>
        </div>
        <div className="mx-2 mt-2 rounded-xl bg-[#0f7b24] px-3 py-2 text-center text-white">
          <p className="line-clamp-1 text-xs font-semibold">{copy.heroBadge}</p>
          {discountPercent != null ? (
            <p className="mt-1 text-[11px] font-bold">
              {locale === "fr" ? `Economisez ${discountPercent}% aujourd'hui` : `وفر ${discountPercent}% اليوم`}
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-4 pt-2 text-center">
        <h2 className="text-4xl font-black leading-none text-[#114114]">{copy.name}</h2>
        {descLines.length ? (
          <p className="mx-auto mt-2 line-clamp-3 min-h-[3.75rem] max-w-sm text-sm leading-relaxed text-[#2a4c2f]">{descLines[0]}</p>
        ) : <p className="mx-auto mt-2 min-h-[3.75rem] max-w-sm" aria-hidden />}
        {heroTestimonial ? (
          <div className="mx-auto mt-3 max-w-xs rounded-2xl border border-[#b8cab5] bg-[#e3ece0] p-3 shadow-sm">
            <p className="text-[10px] text-yellow-600">★★★★★</p>
            <p className="mt-1 line-clamp-3 min-h-[3.75rem] text-sm font-bold">{heroTestimonial.quote}</p>
            <p className="line-clamp-1 text-xs text-[#466246]">{heroTestimonial.name}</p>
            {heroTestimonial.role ? <p className="line-clamp-1 text-[10px] text-[#5d755d]">{heroTestimonial.role}</p> : <p className="min-h-3" aria-hidden />}
          </div>
        ) : (
          <div className="mx-auto mt-3 min-h-[8.5rem] max-w-xs rounded-2xl border border-[#b8cab5] bg-[#e3ece0] p-3 shadow-sm" aria-hidden />
        )}
        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} mt-4 bg-[#11802f]`}>
          {copy.ctaText}
        </button>
      </section>

      <section className="px-3 pt-4">
        <h3 className="text-center text-3xl font-black text-[#1f4a26]">
          {copy.featuresTitle}
        </h3>
        <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl border border-[#c8d6c5] bg-[#eef3eb] p-3">
          {featureItems.map((f, idx) => (
            <div key={`${f ?? "empty"}-${idx}`} className="rounded-xl bg-white/90 px-1 py-2 text-center shadow-sm">
              <FeatureIcon feature={f ?? ""} color={accent} />
              {f ? (
                <p className="mt-1 line-clamp-2 min-h-7 text-[10px] leading-tight text-[#3d5a3d]">{f}</p>
              ) : (
                <p className="mt-1 min-h-7" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 bg-[#08751f] px-3 py-8 text-white">
        <div className="overflow-hidden rounded-2xl border border-white/25">
          <LandingMedia
            mediaType={product.secondary_media_type}
            mediaUrl={product.secondary_media_url || product.media_url}
            mediaName={copy.name}
          />
        </div>
      </section>

      <section className="px-3 pt-4">
        <h3 className="text-center text-xl font-black text-[#143d1a]">
          {copy.testimonialsTitle}
        </h3>
        <p className="mx-auto mt-1 w-fit rounded-full bg-[#e6f3e8] px-3 py-1 text-[10px] font-semibold text-[#136c24]">
          {locale === "fr" ? "★ Avis verifies apres achat" : "★ تقييمات حقيقية من عملاء بعد الشراء"}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {testimonialGridItems.map((tItem, i) => (
            <div
              key={`${tItem?.name ?? "empty"}-${i}`}
              className="rounded-xl bg-[#0f7b24] p-2 text-center text-white shadow-md shadow-[#0f7b24]/30"
            >
              <p className="text-[10px] text-yellow-300">★★★★★</p>
              {tItem ? (
                <>
                  <p className="mt-1 line-clamp-2 min-h-8 text-[10px] font-semibold leading-tight">{tItem.quote}</p>
                  <p className="mt-2 line-clamp-1 text-[9px] opacity-90">{tItem.name}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 min-h-8" aria-hidden />
                  <p className="mt-2 min-h-3" aria-hidden />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 bg-[#136c24] px-2 py-2 text-white">
        <div className="grid grid-cols-3 gap-2 text-center">
          {statItems.map((item, idx) => {
            const [num, ...rest] = (item ?? "").split(" ");
            return (
              <div key={`${item ?? "empty"}-${idx}`}>
                <p className="text-3xl font-black leading-none">
                  {item ? <AnimatedCounter value={num} /> : <span aria-hidden>&nbsp;</span>}
                </p>
                <p className="line-clamp-1 min-h-4 text-[10px]">{rest.join(" ")}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-[#f5f7f4] px-4 py-4 text-center">
        <h3 className="text-2xl font-black text-[#123c17]">
          {copy.mediaCaption}
        </h3>
        {descLines.length > 1 ? (
          <div className="mx-auto mt-2 max-w-xs space-y-1 text-right text-xs leading-relaxed text-[#3a5c3f]">
            {descLines.slice(1, 4).map((line, idx) => (
              <p key={`${line}-${idx}`}>• {line}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="bg-[#08751f] px-3 py-8 text-white">
        <div className="overflow-hidden rounded-2xl border border-white/25">
          <LandingMedia
            mediaType={product.tertiary_media_type}
            mediaUrl={product.tertiary_media_url || product.media_url}
            mediaName={copy.name}
          />
        </div>
      </section>

      <section className="bg-[#ededed] px-4 py-5 text-center">
        <h3 className="text-2xl font-black text-[#1d3b1f]">
          {copy.faqTitle}
        </h3>
        <div className="mx-auto mt-3 max-w-xs space-y-1 text-sm">
          {faqItems.map((faq, i) => (
            <div key={`${faq?.q ?? "empty"}-${i}`} className="border-b border-[#afafaf] pb-2 pt-1 text-right">
              {faq ? (
                <>
                  <p className="line-clamp-1 text-sm font-semibold text-[#1f2f1f]">{faq.q}</p>
                  <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-[#5d5d5d]">{faq.a}</p>
                </>
              ) : (
                <>
                  <p className="min-h-5" aria-hidden />
                  <p className="mt-1 min-h-8" aria-hidden />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#0b7520] px-4 py-5 text-center text-white">
        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} bg-[#2e8441]`}>
          {copy.ctaText}
        </button>
      </section>

      <section className="bg-[#f4f4f4] px-4 py-5 text-center">
        <h3 className="text-lg font-black">{copy.contactTitle}</h3>
        <div className="mt-2 space-y-1 text-sm text-[#272727]">
          {contactItems.map((line, idx) => (
            <p key={`${line ?? "empty"}-${idx}`} dir="ltr" className="line-clamp-1 min-h-5 font-medium">
              {line ?? ""}
            </p>
          ))}
        </div>
      </section>

      <footer className="bg-[#09741f] px-4 py-3 text-center text-white">
        <p className="text-2xl font-black">{copy.name}</p>
      </footer>

      <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[390px] -translate-x-1/2 border-t border-[#0f6320] bg-[#0b7520]/95 px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 text-white shadow-[0_-8px_20px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="line-clamp-1 font-semibold">{copy.heroBadge}</span>
          <span className="font-black">
            {price.discounted != null ? formatPrice(price.discounted) : formatPrice(price.original)}
          </span>
        </div>
        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} w-full bg-[#2e8441]`}>
          {copy.ctaText}
        </button>
      </div>

      <OrderFormModal product={product} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
