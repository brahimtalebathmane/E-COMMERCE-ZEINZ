"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProductRow, Testimonial } from "@/types";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import { LandingMedia } from "./LandingMedia";
import { LandingHeader } from "./LandingHeader";
import { LandingTopBanner } from "./LandingTopBanner";
import { LandingStickyFooter } from "./LandingStickyFooter";
import { useLanguage } from "@/contexts/LanguageContext";
import { MetaPixel, trackInitiateCheckout } from "@/components/MetaPixel";
import { resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import {
  ensureMetaFunnelSession,
  touchMetaFunnelActivity,
  touchMetaFunnelActivityThrottled,
} from "@/lib/meta-client";
import { useInViewOnce } from "@/hooks/useInViewOnce";

const OrderFormModal = dynamic(
  () =>
    import("@/components/landing/OrderFormModal").then((m) => ({
      default: m.OrderFormModal,
    })),
  { ssr: false },
);

type Props = {
  product: ProductRow;
  /** Server-resolved pixel ID (includes META_PIXEL_ID fallback). Prefer over client-only env. */
  resolvedMetaPixelId?: string | null;
};

/** Shared content column: comfortable on phones, widens on tablet/desktop without stretching too wide */
const landingShellClass =
  "mx-auto w-full max-w-[min(100%,24rem)] sm:max-w-[min(100%,26rem)] md:max-w-[min(100%,36rem)] lg:max-w-3xl xl:max-w-4xl";

/** Full-bleed strip (translate-centered `100vw`). Wrapper uses `dir="ltr"` so centering stays stable vs `overflow-x-clip`. */
const fullBleedStripClass =
  "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2";

/** Title/copy aligned with other sections while the band behind gallery media spans the full viewport. */
const sectionContentInsetClass = `${landingShellClass} px-4 sm:px-6 md:px-8 lg:px-10`;

const primaryCtaClass =
  "store-btn-primary rounded-2xl px-5 py-3.5 text-base font-semibold shadow-[0_16px_36px_rgba(0,107,12,0.28)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.985] sm:px-6 sm:py-4 sm:text-lg sm:font-extrabold";

/** FAQ → Contact strip: full-bleed band behind CTA; pill is centered with capped width (background from admin: image / color / gradient). */
const preContactCtaButtonClass =
  "store-btn-primary mx-auto flex w-full max-w-[14.5rem] justify-center rounded-full px-4 py-1.5 text-sm font-semibold shadow-[0_8px_20px_rgba(0,107,12,0.22)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.985] sm:max-w-[16rem] sm:px-5 sm:py-2 sm:font-bold";

/** Edge-to-edge band behind the pre-contact CTA (pairs with `fullBleedStripClass`). */
const preContactCtaBandClass =
  "relative min-h-[3.25rem] overflow-hidden border-y border-[var(--accent-muted)]/40 shadow-[0_8px_24px_rgba(12,28,12,0.08)] sm:min-h-[3.5rem]";

const sectionPadClass = "px-4 py-8 sm:px-6 sm:py-10 md:px-8 lg:px-10";
const softCardClass =
  "rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] shadow-[0_14px_28px_rgba(12,28,12,0.08)] sm:rounded-[24px]";
const sectionTitleClass =
  "text-center text-lg font-bold leading-snug tracking-tight text-[var(--foreground)] sm:text-xl md:text-2xl md:leading-tight";
const bodyTextClass = "text-sm leading-relaxed text-[var(--muted)] sm:text-base sm:leading-relaxed";
const heroTitleClass =
  "whitespace-pre-line break-words font-extrabold leading-[1.15] tracking-tight text-[var(--accent)] [font-size:clamp(1.4rem,3.6vw+0.7rem,2rem)]";
const productNameClass =
  "break-words font-bold leading-snug text-[var(--foreground)] [font-size:clamp(1.2rem,2.4vw+0.65rem,1.75rem)] sm:font-extrabold";

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

function AnimatedCounter({ value, active }: { value: string; active: boolean }) {
  const target = statNumber(value);
  const suffix = statSuffix(value);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrent(0);
      return;
    }
    if (target <= 0) {
      setCurrent(0);
      return;
    }
    let frame = 0;
    const duration = 1550;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);

  return (
    <span>
      {current}
      {suffix}
    </span>
  );
}

/** Features grid + title: slightly slower entrance. */
const motionFeaturesDurationClass =
  "duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-0";
/** Reviews (header + cards): slightly slower slide/fade. */
const motionReviewsDurationClass =
  "duration-[750ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-0";

function TestimonialReveal({
  testimonial,
  idx,
  bodyTextClass,
}: {
  testimonial: Testimonial;
  idx: number;
  bodyTextClass: string;
}) {
  const [setRef, visible] = useInViewOnce({ rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  const fromLeft = idx % 2 === 0;
  const slideState = visible
    ? "translate-x-0 opacity-100"
    : fromLeft
      ? "-translate-x-8 opacity-0 sm:-translate-x-10"
      : "translate-x-8 opacity-0 sm:translate-x-10";

  return (
    <article
      ref={setRef}
      className={`rounded-3xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 shadow-[0_14px_24px_rgba(12,28,12,0.07)] transition-[transform,opacity] ${motionReviewsDurationClass} will-change-transform ${slideState} motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0`}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--accent-muted)]">
          {testimonial.image ? (
            <Image src={testimonial.image} alt={testimonial.name} fill sizes="48px" className="object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-sm font-semibold leading-snug text-[var(--foreground)] sm:text-[0.95rem]">{testimonial.name}</p>
          {testimonial.location ? (
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{testimonial.location}</p>
          ) : null}
          <p className="mt-1 text-sm leading-none text-[var(--accent)]">{starText(testimonial.rating)}</p>
        </div>
      </div>
      <p className={`mt-3 break-words ${bodyTextClass}`}>{`"${testimonial.quote}"`}</p>
    </article>
  );
}

function FeatureCard({
  feature,
  idx,
  accent,
  softCardClass,
  visible,
}: {
  feature: string | null;
  idx: number;
  accent: string;
  softCardClass: string;
  visible: boolean;
}) {
  const tiltHidden = idx % 2 === 0 ? "-rotate-[2.5deg]" : "rotate-[2.5deg]";
  const enter = visible
    ? "translate-y-0 scale-100 rotate-0 opacity-100"
    : `translate-y-6 scale-[0.96] ${tiltHidden} opacity-0 sm:translate-y-7`;
  const delayMs = visible ? idx * 115 : 0;

  return (
    <div
      className={`${softCardClass} flex min-h-[120px] flex-col justify-start p-3 text-center transition-[transform,opacity] ${motionFeaturesDurationClass} will-change-transform ${enter} motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:rotate-0 motion-reduce:opacity-100 motion-reduce:transition-none hover:-translate-y-0.5 sm:min-h-[132px] sm:p-4 motion-reduce:hover:translate-y-0`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <FeatureIcon feature={feature ?? ""} color={accent} />
      {feature ? (
        <p className="mt-2 text-xs font-semibold leading-snug text-[var(--foreground)] sm:text-sm">{feature}</p>
      ) : (
        <p className="mt-2 min-h-10" aria-hidden />
      )}
    </div>
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
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent-muted)] bg-[var(--background)]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

export function ProductLanding({ product, resolvedMetaPixelId }: Props) {
  const { locale, setLocale } = useLanguage();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);
  const [open, setOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const accent = copy.brandColor;

  const stats = copy.stats;
  const contacts = copy.contactLines;
  const descLines = copy.description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const testimonials = copy.testimonials;
  /** Spotlight above CTA — same source row as admin order #1 */
  const heroTestimonial = testimonials[0] ?? null;
  /** Full reviews section: every admin testimonial once, same order (no wrap-around padding). */
  const sectionTestimonials = testimonials;

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

  const metaPixelId =
    resolvedMetaPixelId ?? resolvePublicMetaPixelId(product.meta_pixel_id);

  const openCheckout = () => {
    try {
      touchMetaFunnelActivity();
      trackInitiateCheckout(ensureMetaFunnelSession(), metaPixelId);
    } catch {
      // ignore
    }
    setOpen(true);
  };

  const ctaBannerImg = product.cta_banner_background_image_url?.trim() ?? "";
  const ctaBannerColor = product.cta_banner_background_color?.trim() ?? "";
  const ctaBannerOverlay = Math.min(1, Math.max(0, Number(product.cta_banner_image_overlay ?? 0.45)));

  const [setFeaturesRef, featuresVisible] = useInViewOnce();
  const [setTestimonialsSectionRef, testimonialsSectionVisible] = useInViewOnce();
  const [setStatsRef, statsVisible] = useInViewOnce();

  const featuresTitleMotion = featuresVisible
    ? "translate-y-0 opacity-100"
    : "translate-y-5 opacity-0 sm:translate-y-6";
  const testimonialsHeaderMotion = testimonialsSectionVisible
    ? "translate-y-0 opacity-100"
    : "translate-y-4 opacity-0";

  return (
    <div
      className="w-full min-w-0 overflow-x-clip bg-[var(--background)] pb-[max(10rem,calc(7.5rem+env(safe-area-inset-bottom)))] text-[var(--foreground)] md:pb-[max(11.25rem,calc(8.25rem+env(safe-area-inset-bottom)))]"
      dir="ltr"
      style={
        {
          "--accent": copy.brandColor,
          "--accent-muted": `color-mix(in srgb, ${copy.brandColor} 34%, white)`,
          "--accent-foreground": "#f0fff0",
          "--card": "#f4fff4",
          "--muted": "#4a5c4a",
          "--brand-accent": accent,
        } as CSSProperties
      }
    >
      <MetaPixel pixelId={metaPixelId} />

      <div className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        {copy.headerBarText.trim() ? (
          <LandingTopBanner text={copy.headerBarText} bleedClassName={fullBleedStripClass} />
        ) : null}
        <LandingHeader logoSrc={copy.logoUrl} headerCtaText={copy.headerCtaText} />
      </div>

      {/* Hero: title → media → name → description → testimonial → CTA → reassurance */}
      <section
        className="bg-[var(--background)] px-4 pb-8 pt-5 text-center sm:px-6 sm:pb-10 md:px-8"
        aria-labelledby="hero-title"
      >
        <h1 id="hero-title" className={`mx-auto max-w-[34rem] ${heroTitleClass}`}>
          {copy.heroSubtitle}
        </h1>

        <div className={`${fullBleedStripClass} mt-4 sm:mt-5`} dir="ltr">
          <LandingMedia product={product} priority edgeToEdge primaryHero />
        </div>

        <h2 className={`mt-4 sm:mt-5 ${productNameClass}`}>{copy.name}</h2>

        {heroSummary ? (
          <p className={`mx-auto mt-2 max-w-[34rem] break-words ${bodyTextClass}`}>{heroSummary}</p>
        ) : null}

        {heroTestimonial ? (
          <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-[var(--accent-muted)] bg-[linear-gradient(180deg,var(--card)_0%,var(--background)_100%)] px-4 py-3 text-right shadow-[0_12px_22px_rgba(22,75,22,0.15)] sm:mt-5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-[var(--foreground)] sm:text-[0.95rem]">{heroTestimonial.name}</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--foreground)] sm:text-base">{heroTestimonial.quote}</p>
                <p className="mt-1 text-sm text-[var(--accent)]">{starText(heroTestimonial.rating)}</p>
              </div>
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--accent-muted)]">
                {heroTestimonial.image ? (
                  <Image src={heroTestimonial.image} alt={heroTestimonial.name} fill className="object-cover" sizes="64px" />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <button type="button" onClick={openCheckout} className={`${primaryCtaClass} mt-4 w-full max-w-lg sm:mx-auto sm:mt-5`}>
          {ctaText}
        </button>
        <p className={`mx-auto mt-2 max-w-lg ${bodyTextClass} font-medium`}>{codReassurance}</p>
      </section>

      <section ref={setFeaturesRef} className={`bg-[var(--card)] ${sectionPadClass}`}>
        <h2
          className={`${sectionTitleClass} break-words transition-[transform,opacity] ${motionFeaturesDurationClass} will-change-transform ${featuresTitleMotion} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`}
        >
          {copy.featuresTitle}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-4">
          {featureItems.map((f, idx) => (
            <FeatureCard
              key={`${f ?? "empty"}-${idx}`}
              feature={f}
              idx={idx}
              accent={accent}
              softCardClass={softCardClass}
              visible={featuresVisible}
            />
          ))}
        </div>
      </section>

      <section className="w-full bg-[var(--card)] py-8 sm:py-10">
        <div className={sectionContentInsetClass}>
          <h3 className={`${sectionTitleClass} break-words`}>{copy.mediaCaption}</h3>
        </div>
        <div className="mt-4 w-full">
          <LandingMedia
            mediaType={product.secondary_media_type}
            mediaUrl={product.secondary_media_url || product.media_url}
            mediaName={copy.name}
            edgeToEdge
            immersive
          />
        </div>
        {descLines.length > 3 ? (
          <div className={`${sectionContentInsetClass} mt-3 sm:mt-4`}>
            <div className={`${softCardClass} space-y-1.5 rounded-2xl px-4 py-3 ${bodyTextClass}`}>
              {descLines.slice(3, 6).map((line, idx) => (
                <p key={`${line}-${idx}`}>• {line}</p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {product.gallery.length > 0 ? (
        <section className={`bg-[var(--background)] ${sectionPadClass}`}>
          <h3 className={`${sectionTitleClass} break-words`}>
            {locale === "fr" ? "Galerie" : "معرض الصور"}
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {product.gallery.map((src, gi) => (
              <div
                key={`${src}-${gi}`}
                className="relative aspect-square overflow-hidden rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-muted)]"
              >
                <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 45vw, 240px" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section ref={setTestimonialsSectionRef} className={`bg-[var(--background)] ${sectionPadClass}`}>
        <h3
          className={`${sectionTitleClass} break-words transition-[transform,opacity] ${motionReviewsDurationClass} will-change-transform ${testimonialsHeaderMotion} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`}
        >
          {copy.testimonialsTitle}
        </h3>
        <p
          className={`mx-auto mt-2 w-fit rounded-full bg-[var(--accent-muted)] px-3 py-1 text-[0.65rem] font-semibold leading-normal text-[var(--accent)] transition-[transform,opacity] sm:px-4 sm:text-xs ${motionReviewsDurationClass} will-change-transform ${testimonialsHeaderMotion} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`}
          style={{ transitionDelay: testimonialsSectionVisible ? "150ms" : "0ms" }}
        >
          {copy.testimonialsBadge}
        </p>
        <div className="mt-5 space-y-3">
          {sectionTestimonials.map((testimonial, idx) => (
            <TestimonialReveal
              key={`${idx}-${testimonial.name}-${testimonial.quote.slice(0, 48)}`}
              testimonial={testimonial}
              idx={idx}
              bodyTextClass={bodyTextClass}
            />
          ))}
        </div>
      </section>

      <section ref={setStatsRef} className={`bg-[var(--card)] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words`}>{copy.statsSectionTitle}</h3>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center sm:mt-6 sm:gap-4">
          {statItems.map((item, idx) => {
            const raw = item ?? "";
            const numberPart = raw.split(" ")[0] ?? raw;
            return (
              <div key={`${item ?? "empty"}-${idx}`} className={`${softCardClass} rounded-2xl px-1.5 py-3 sm:px-3 sm:py-4`}>
                <p className="text-xl font-bold tabular-nums leading-none tracking-tight text-[var(--foreground)] sm:text-2xl md:text-3xl">
                  {item ? <AnimatedCounter value={numberPart} active={statsVisible} /> : <span aria-hidden>&nbsp;</span>}
                </p>
                <p className="mt-1.5 text-[0.65rem] font-medium leading-snug text-[var(--muted)] sm:text-xs">
                  {item ? statLabel(raw) : ""}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {product.tertiary_media_url ? (
        <section className="w-full bg-[var(--background)] py-8 sm:py-10">
          <div className="w-full">
            <LandingMedia
              mediaType={product.tertiary_media_type}
              mediaUrl={product.tertiary_media_url}
              mediaName={copy.name}
              edgeToEdge
              immersive
            />
          </div>
        </section>
      ) : null}

      <section className={`bg-[var(--card)] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words`}>{copy.faqTitle}</h3>
        <div className="mt-4 space-y-3 sm:mt-5">
          {faqItems.map((faq, i) => {
            const opened = openFaqIndex === i;
            return (
              <div key={`${faq?.q ?? "empty"}-${i}`} className="overflow-hidden rounded-2xl border border-[var(--accent-muted)] bg-[var(--background)] shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5"
                  onClick={() => setOpenFaqIndex((prev) => (prev === i ? null : i))}
                >
                  <span className="break-words text-start text-sm font-semibold leading-snug text-[var(--foreground)] sm:text-base">{faq?.q ?? ""}</span>
                  <span className="shrink-0 text-lg font-semibold text-[var(--accent)] sm:text-xl">{opened ? "−" : "+"}</span>
                </button>
                <div
                  className={`grid transition-all duration-[400ms] ease-out ${opened ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className={`break-words px-4 pb-4 pt-0 text-start sm:px-5 ${bodyTextClass}`}>{faq?.a ?? ""}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="order-form-section" className="scroll-mt-6 w-full py-3 sm:py-4">
        <div className={`${fullBleedStripClass} ${preContactCtaBandClass}`}>
          <div className="pointer-events-none absolute inset-0">
            {ctaBannerImg ? (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${ctaBannerImg})` }}
                  role="presentation"
                />
                <div
                  className="absolute inset-0 bg-black"
                  style={{ opacity: ctaBannerOverlay }}
                  role="presentation"
                />
              </>
            ) : ctaBannerColor ? (
              <div className="absolute inset-0" style={{ backgroundColor: ctaBannerColor }} role="presentation" />
            ) : (
              <div
                className="absolute inset-0 bg-gradient-to-br from-[var(--card)] via-[var(--background)] to-[var(--accent-muted)]"
                role="presentation"
              />
            )}
          </div>
          <div className="relative z-10 flex justify-center px-4 py-3 sm:px-6 sm:py-3.5">
            <button
              type="button"
              onClick={openCheckout}
              className={`${preContactCtaButtonClass} ${ctaBannerImg ? "ring-2 ring-white/40 shadow-[0_10px_26px_rgba(0,0,0,0.24)]" : ""}`}
            >
              {ctaText}
            </button>
          </div>
        </div>
      </section>

      <section className={`bg-[var(--card)] ${sectionPadClass}`}>
        <h3 className={`${sectionTitleClass} break-words`}>{copy.contactTitle}</h3>
        <div className="mt-5 space-y-3 sm:mx-auto sm:max-w-lg">
          {contactItems.map((line, idx) => {
            const value = line ?? "";
            const lower = value.toLowerCase();
            const isEmail = lower.includes("@") || lower.includes("mail");
            const isWhatsApp = lower.includes("whatsapp") || lower.includes("واتساب");
            const label = isEmail ? "الايميل" : isWhatsApp ? "الواتساب" : "الهاتف";
            const icon = isEmail ? "✉" : isWhatsApp ? "◉" : "☎";
            return (
              <div key={`${value}-${idx}`} className={`${softCardClass} rounded-2xl px-4 py-3 sm:py-4`}>
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{icon} {label}</p>
                <p className="mt-1 break-all text-sm font-semibold leading-snug text-[var(--foreground)] sm:text-base" dir="ltr">
                  {value}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="bg-[var(--accent-muted)] px-4 py-5 text-center sm:py-6">
        <p className="text-xs font-semibold text-[var(--muted)] sm:text-sm">{copy.footerNote}</p>
      </footer>

      <LandingStickyFooter
        product={product}
        ctaLabel={ctaText}
        locale={locale}
        onCheckout={openCheckout}
      />

      <OrderFormModal
        product={product}
        metaPixelId={metaPixelId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
