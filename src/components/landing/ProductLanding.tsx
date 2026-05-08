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
  "store-btn-primary rounded-[18px] px-6 py-4 text-lg font-extrabold shadow-[0_16px_36px_rgba(223,130,55,0.34)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.985]";
const sectionPadClass = "px-4 py-8";
const softCardClass =
  "rounded-[24px] border border-[#eddccc] bg-white shadow-[0_14px_28px_rgba(88,58,32,0.1)]";
const sectionTitleClass = "text-center text-[1.62rem] font-black leading-[1.28] tracking-[-0.01em]";

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

function statLabel(raw: string): string {
  return raw.replace(/,/g, "").replace(/\d+/, "").replace(/\+/g, "").trim();
}

function starText(rating?: number): string {
  const value = Math.max(1, Math.min(5, Math.round(rating ?? 5)));
  return "★".repeat(value) + "☆".repeat(5 - value);
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
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#ebdac8] bg-[#fff8f0]">
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
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const accent = copy.brandColor || "#f08a3e";

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
  const ctaText = copy.ctaText.trim() || "اغتنم العرض الآن";
  const heroSummary = descLines[0] ?? "";
  const codReassurance =
    descLines[1] ??
    (locale === "fr"
      ? "Paiement a la livraison disponible dans toutes les zones"
      : "الدفع عند الاستلام متاح في كل المناطق");
  const trustSnippet =
    descLines[2] ??
    stats[0] ??
    (locale === "fr" ? "Plus de 5000 clients satisfaits" : "اكثر من 5000 عميل راض");

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
      className="mx-auto max-w-[390px] overflow-hidden bg-[#fff7ee] pb-24 text-[#251b13] md:max-w-[460px]"
      dir={dir}
      style={
        {
          "--accent": "#ef8a3d",
          "--accent-foreground": "#fff9f4",
          "--accent-muted": "#f1e4d6",
          "--card": "#fff9f1",
          "--muted": "#776450",
          "--brand-accent": accent,
        } as CSSProperties
      }
    >
      <MetaPixel pixelId={product.meta_pixel_id} />

      <header className="bg-[#fef6ea] px-4 pb-7 pt-5 text-center">
        <div className="mx-auto w-full max-w-xs">
          <span className="mb-3 inline-flex rounded-full border border-[#efddca] bg-white px-3 py-1.5 text-xs font-bold leading-none text-[#875a33] shadow-sm">
            {copy.heroBadge}
          </span>
        </div>
        <div className="mx-auto mb-4 w-fit rounded-full bg-white px-3 py-1.5 shadow-sm">
          <Image src={copy.logoUrl} alt="logo" width={72} height={28} className="h-6 w-auto object-contain" />
        </div>
      </header>

      <section className="bg-[#fef6ea] px-4 pb-8">
        <div className="mx-auto overflow-hidden rounded-[26px] border border-[#f0dfcf] bg-[#fffaf3] p-2 shadow-[0_20px_36px_rgba(100,67,37,0.12)]">
          <LandingMedia product={product} priority />
        </div>

        <div className="mx-auto mt-5 max-w-sm rounded-[24px] border border-[#f0decf] bg-[#fffaf3] p-5 text-center shadow-[0_16px_30px_rgba(106,70,35,0.1)]">
          <div className="mx-auto mb-3 inline-flex rounded-full bg-[#fff0e4] px-4 py-1 text-[11px] font-extrabold text-[#bb6425]">
            {discountPercent != null
              ? locale === "fr"
                ? `- ${discountPercent}% aujourd'hui`
                : `خصم ${discountPercent}% لفترة محدودة`
              : copy.heroBadge}
          </div>
          <div className="flex items-end justify-center gap-3">
            {price.discounted != null ? (
              <span className="text-sm font-semibold text-[#9b7f66] line-through">{formatPrice(price.original)}</span>
            ) : null}
            <span className="text-[2.5rem] font-black leading-none tracking-[-0.02em] text-[#20160f]">
              {price.discounted != null ? formatPrice(price.discounted) : formatPrice(price.original)}
            </span>
          </div>
          <h1 className="mt-5 break-words text-[1.95rem] font-black leading-[1.24] tracking-[-0.01em] text-[#1f1913]">{copy.name}</h1>
          {copy.heroSubtitle ? (
            <p className="mt-2 break-words text-[1.02rem] font-medium leading-[1.68] text-[#6d5644]">{copy.heroSubtitle}</p>
          ) : null}
          {heroSummary ? (
            <p className="mt-3 break-words rounded-2xl bg-[#fff3e7] px-4 py-3 text-[0.95rem] leading-[1.72] text-[#5e4838]">{heroSummary}</p>
          ) : null}
          <button type="button" onClick={openCheckout} className={`${primaryCtaClass} mt-6 w-full bg-[#ef8a3d]`}>
            {ctaText}
          </button>
          <p className="mt-3 text-[0.95rem] font-semibold leading-[1.55] text-[#3f2f24]">{codReassurance}</p>
          <p className="mt-1 text-[0.78rem] font-semibold leading-[1.45] text-[#8b674a]">{trustSnippet}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {stats.slice(0, 3).map((line, idx) => (
              <span
                key={`${line}-${idx}`}
                className="inline-flex max-w-full truncate rounded-full border border-[#efddca] bg-white px-2.5 py-1 text-[10px] font-bold text-[#7b6049]"
              >
                {line}
              </span>
            ))}
          </div>
          {heroTestimonial ? (
            <div className="mx-auto mt-4 flex max-w-xs items-center gap-2 rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#f4e6d9]">
                {heroTestimonial.image ? (
                  <Image src={heroTestimonial.image} alt={heroTestimonial.name} fill className="object-cover" sizes="40px" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#d38b30]">{starText(heroTestimonial.rating)}</p>
                <p className="line-clamp-1 text-xs font-bold text-[#3d2d22]">{heroTestimonial.name}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={`bg-[#fffaf3] ${sectionPadClass}`}>
        <h2 className={`${sectionTitleClass} text-[#2a1e15]`}>{copy.featuresTitle}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {featureItems.map((f, idx) => (
            <div
              key={`${f ?? "empty"}-${idx}`}
              className={`${softCardClass} flex min-h-[132px] flex-col justify-start p-3 text-center transition-transform duration-200 hover:-translate-y-0.5`}
            >
              <FeatureIcon feature={f ?? ""} color={accent} />
              {f ? (
                <p className="mt-2 text-[0.92rem] font-bold leading-[1.45] text-[#3f2f23]">{f}</p>
              ) : (
                <p className="mt-2 min-h-10" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`bg-[#f9eede] ${sectionPadClass}`}>
              <h3 className={`${sectionTitleClass} break-words text-[#2f2115]`}>
          {locale === "fr" ? "Pourquoi nos clients nous font confiance" : "لماذا يثق بنا العملاء"}
        </h3>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {statItems.map((item, idx) => {
            const raw = item ?? "";
            const numberPart = raw.split(" ")[0] ?? raw;
            return (
              <div key={`${item ?? "empty"}-${idx}`} className={`${softCardClass} rounded-2xl px-2 py-4`}>
                <p className="text-[1.95rem] font-black leading-none tracking-[-0.01em] text-[#23201b]">
                  {item ? <AnimatedCounter value={numberPart} /> : <span aria-hidden>&nbsp;</span>}
                </p>
                <p className="mt-1 text-[0.72rem] font-semibold leading-[1.4] text-[#6d5846]">
                  {item ? statLabel(raw) : ""}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`bg-[#fff5e8] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words text-[#2d2015]`}>{copy.mediaCaption}</h3>
        <div className="mt-4 overflow-hidden rounded-[24px] border border-[#ecdac6] bg-[#fffaf3] p-2 shadow-[0_16px_28px_rgba(88,58,32,0.1)]">
          <LandingMedia
            mediaType={product.secondary_media_type}
            mediaUrl={product.secondary_media_url || product.media_url}
            mediaName={copy.name}
          />
        </div>
        {descLines.length > 3 ? (
          <div className={`${softCardClass} mt-3 space-y-1 rounded-2xl px-4 py-3 text-[0.93rem] leading-[1.7] text-[#5e4736]`}>
            {descLines.slice(3, 6).map((line, idx) => (
              <p key={`${line}-${idx}`}>• {line}</p>
            ))}
          </div>
        ) : null}
        {product.tertiary_media_url ? (
          <div className="mt-4 overflow-hidden rounded-[24px] border border-[#ecdac6] bg-[#fffaf3] p-2 shadow-[0_16px_28px_rgba(88,58,32,0.1)]">
            <LandingMedia
              mediaType={product.tertiary_media_type}
              mediaUrl={product.tertiary_media_url}
              mediaName={copy.name}
            />
          </div>
        ) : null}
      </section>

      <section className={`bg-[#fff9f2] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words text-[#291f17]`}>{copy.testimonialsTitle}</h3>
        <p className="mx-auto mt-2 w-fit rounded-full bg-[#ffeede] px-4 py-1 text-[0.72rem] font-bold leading-none text-[#a8642d]">
          {locale === "fr" ? "Avis verifies apres achat" : "تقييمات من استبيانات ما بعد البيع"}
        </p>
        <div className="mt-5 space-y-3">
          {[heroTestimonial, ...testimonialGridItems].filter(Boolean).map((item, idx) => {
            const testimonial = item!;
            return (
              <article
                key={`${testimonial.name}-${idx}`}
                className="rounded-3xl border border-[#efdfcf] bg-white p-4 shadow-[0_14px_24px_rgba(96,66,38,0.08)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#f4e5d6]">
                    {testimonial.image ? (
                      <Image src={testimonial.image} alt={testimonial.name} fill sizes="48px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[0.95rem] font-black leading-[1.25] text-[#2f2218]">{testimonial.name}</p>
                    {testimonial.location ? (
                      <p className="mt-0.5 text-[0.76rem] leading-[1.35] text-[#8a6b51]">{testimonial.location}</p>
                    ) : null}
                    <p className="mt-1 text-[0.9rem] leading-none text-[#db9235]">{starText(testimonial.rating)}</p>
                  </div>
                </div>
                <p className="mt-3 break-words text-[0.93rem] leading-[1.72] text-[#4c3a2d]">{`"${testimonial.quote}"`}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`bg-[#fff4e8] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words text-[#2f2014]`}>{copy.faqTitle}</h3>
        <div className="mt-4 space-y-3">
          {faqItems.map((faq, i) => {
            const opened = openFaqIndex === i;
            return (
              <div key={`${faq?.q ?? "empty"}-${i}`} className="overflow-hidden rounded-2xl border border-[#ecdac8] bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-5 text-right"
                  onClick={() => setOpenFaqIndex((prev) => (prev === i ? null : i))}
                >
                  <span className="text-[0.96rem] font-bold leading-[1.42] text-[#332419] break-words">{faq?.q ?? ""}</span>
                  <span className="text-xl font-bold text-[#b9783f]">{opened ? "−" : "+"}</span>
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${opened ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="break-words px-4 pb-4 text-[0.93rem] leading-[1.72] text-[#6f5845]">{faq?.a ?? ""}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-[#fef2e4] px-4 py-8 text-center">
        <div className={`${softCardClass} px-4 py-5`}>
          <p className="text-[0.95rem] font-semibold leading-[1.45] text-[#805f44]">
            {copy.heroBadge}
          </p>
          <p className="mt-1 text-[0.78rem] font-semibold leading-[1.45] text-[#8f6a4d]">{trustSnippet}</p>
          <button type="button" onClick={openCheckout} className={`${primaryCtaClass} mt-3 w-full bg-[#ef8a3d]`}>
            {ctaText}
          </button>
        </div>
      </section>

      <section className={`bg-[#fffaf3] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words text-[#2f2217]`}>{copy.contactTitle}</h3>
        <div className="mt-5 space-y-3">
          {contactItems.map((line, idx) => {
            const value = line ?? "";
            const lower = value.toLowerCase();
            const isEmail = lower.includes("@") || lower.includes("mail");
            const isWhatsApp = lower.includes("whatsapp") || lower.includes("واتساب");
            const label = isEmail ? "الايميل" : isWhatsApp ? "الواتساب" : "الهاتف";
            const icon = isEmail ? "✉" : isWhatsApp ? "◉" : "☎";
            return (
              <div key={`${value}-${idx}`} className={`${softCardClass} rounded-2xl px-4 py-3`}>
                <p className="text-[0.76rem] font-bold leading-none text-[#9f714d]">{icon} {label}</p>
                <p className="mt-1 break-all text-[0.95rem] font-bold leading-[1.4] text-[#32251b]" dir="ltr">
                  {value}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="bg-[#f0ded0] px-4 py-5 text-center">
        <p className="text-sm font-bold text-[#6a4e36]">
          {locale === "fr" ? "Tous droits reserves 2026" : "جميع الحقوق محفوظة 2026"}
        </p>
      </footer>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e2c8af] bg-[#fff8ee]/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-[0_-8px_24px_rgba(76,48,24,0.18)] backdrop-blur md:hidden">
        <div className="mx-auto max-w-[390px]">
          <div className="mb-2 flex items-center justify-between text-[0.76rem] font-bold leading-none text-[#6f533d]">
            <span className="line-clamp-1">{copy.heroBadge}</span>
            <div className="text-left">
              <p className="text-[1rem] font-black leading-none tracking-[-0.01em] text-[#2f2117]">
                {price.discounted != null ? formatPrice(price.discounted) : formatPrice(price.original)}
              </p>
              {price.discounted != null ? (
                <p className="text-[10px] text-[#8f6b4e] line-through">{formatPrice(price.original)}</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={openCheckout} className={`${primaryCtaClass} w-full bg-[#ef8a3d]`}>
            {ctaText}
          </button>
        </div>
      </div>

      <OrderFormModal product={product} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
