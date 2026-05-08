"use client";

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

export function ProductLanding({ product }: Props) {
  const { dir, locale, setLocale } = useLanguage();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);
  const [open, setOpen] = useState(false);

  const stats = copy.stats.length ? copy.stats : ["19240+ طلب", "18691+ عميل", "47+ نقطة"];
  const contacts = copy.contactLines.length
    ? copy.contactLines
    : ["+222 00 00 00 00", "@zeina.store"];

  const price = useMemo(() => {
    const original = product.price;
    const discounted = product.discount_price != null ? product.discount_price : null;
    return { original, discounted };
  }, [product]);

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
      className="mx-auto max-w-md overflow-hidden bg-[#e9f0e7] text-[#0f230f]"
      dir={dir}
      style={
        {
          "--accent": "#167f2d",
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
          <span>زينة</span>
          <span>{locale === "fr" ? "Offre du jour" : "العرض اليومي"}</span>
        </div>
        <h1 className="text-3xl font-black leading-tight">{copy.name}</h1>
        <p className="mt-1 text-sm text-[#3f5d3f]">
          {copy.heroSubtitle || copy.description.split("\n")[0]}
        </p>
      </header>

      <section className="px-3 pb-2 pt-4">
        <div className="overflow-hidden rounded-xl border border-[#8dae8b] bg-[#08751f]">
          <LandingMedia product={product} priority />
        </div>
        <div className="mx-2 mt-2 rounded-full bg-[#d2ddd0] px-4 py-1 text-xs font-semibold">
          <div className="flex items-center justify-between">
            <span>{price.discounted != null ? formatPrice(price.discounted) : formatPrice(price.original)}</span>
            <span className={price.discounted != null ? "opacity-70 line-through" : "opacity-0"}>
              {formatPrice(price.original)}
            </span>
          </div>
        </div>
      </section>

      <section className="px-4 pt-2 text-center">
        <h2 className="text-4xl font-black leading-none">{copy.name}</h2>
        {copy.testimonials[0] ? (
          <div className="mx-auto mt-2 max-w-xs rounded-2xl border border-[#b8cab5] bg-[#e3ece0] p-3 shadow-sm">
            <p className="text-[10px] text-yellow-600">★★★★★</p>
            <p className="mt-1 text-sm font-bold">{copy.testimonials[0].quote}</p>
            <p className="text-xs text-[#466246]">{copy.testimonials[0].name}</p>
          </div>
        ) : null}
        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} mt-3 bg-[#1b8f37]`}>
          {locale === "fr" ? "Choisir l'offre maintenant" : "اغتنم العرض الآن"}
        </button>
      </section>

      {copy.features.length ? (
        <section className="px-3 pt-4">
          <h3 className="text-center text-3xl font-black text-[#294529]">
            {locale === "fr" ? "Pourquoi nous ?" : "لماذا نحن"}
          </h3>
          <div className="mt-2 grid grid-cols-4 gap-2 rounded-2xl border border-[#c8d6c5] bg-[#eef3eb] p-3">
            {copy.features.slice(0, 4).map((f, idx) => (
              <div key={f} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#9cb59a] bg-white text-lg">
                  {["🍃", "✅", "⭐", "🛡️"][idx] ?? "✓"}
                </div>
                <p className="mt-1 text-[10px] leading-tight text-[#3d5a3d]">{f}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-4 bg-[#08751f] px-3 py-8 text-white">
        <div className="overflow-hidden rounded-xl border border-white/25">
          <LandingMedia product={product} />
        </div>
      </section>

      {copy.testimonials.length ? (
        <section className="px-3 pt-4">
          <h3 className="text-center text-lg font-black">
            {locale === "fr" ? "Noté 4.8+ par 5000 utilisateurs" : "+4.8 تقييم من اكثر 5000 مستخدم"}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {copy.testimonials.slice(0, 4).map((tItem, i) => (
              <div key={`${tItem.name}-${i}`} className="rounded-lg bg-[#0f7b24] p-2 text-white">
                <p className="text-[10px] text-yellow-300">★★★★★</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold">{tItem.quote}</p>
                <p className="mt-2 text-[10px]">{tItem.name}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-3 bg-[#136c24] px-2 py-2 text-white">
        <div className="grid grid-cols-3 gap-2 text-center">
          {stats.slice(0, 3).map((item) => {
            const [num, ...rest] = item.split(" ");
            return (
              <div key={item}>
                <p className="text-3xl font-black leading-none">{num}</p>
                <p className="text-[10px]">{rest.join(" ")}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-4 py-4 text-center">
        <h3 className="text-2xl font-black">
          {locale === "fr" ? "Titre de l'image ou vidéo" : "عنوان الصورة أو فيديو"}
        </h3>
      </section>

      <section className="bg-[#08751f] px-3 py-8 text-white">
        <div className="overflow-hidden rounded-xl border border-white/25">
          <LandingMedia product={product} />
        </div>
      </section>

      {copy.faqs.length ? (
        <section className="bg-[#ededed] px-4 py-5 text-center">
          <h3 className="text-2xl font-black text-[#1d3b1f]">
            {locale === "fr" ? "Questions fréquentes" : "أسئلة شائعة"}
          </h3>
          <div className="mx-auto mt-3 max-w-xs space-y-2 text-sm">
            {copy.faqs.slice(0, 4).map((faq, i) => (
              <details key={`${faq.q}-${i}`} className="border-b border-[#999] pb-1">
                <summary className="cursor-pointer list-none font-semibold">{faq.q}</summary>
                <p className="mt-1 text-xs text-[#5d5d5d]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bg-[#0b7520] px-4 py-5 text-center text-white">
        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} bg-[#2e8441]`}>
          {locale === "fr" ? "Choisir l'offre maintenant" : "اغتنم العرض الآن"}
        </button>
      </section>

      <section className="bg-[#f4f4f4] px-4 py-5 text-center">
        <h3 className="text-lg font-black">{locale === "fr" ? "Contact" : "جهات الاتصال"}</h3>
        <div className="mt-2 space-y-1 text-sm text-[#272727]">
          {contacts.map((line) => (
            <p key={line} dir="ltr">
              {line}
            </p>
          ))}
        </div>
      </section>

      <footer className="bg-[#09741f] px-4 py-3 text-center text-white">
        <p className="text-2xl font-black">زينة</p>
        <p className="text-xs opacity-80">{locale === "fr" ? "Tous droits réservés" : "جميع الحقوق محفوظة"}</p>
      </footer>

      <OrderFormModal product={product} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
