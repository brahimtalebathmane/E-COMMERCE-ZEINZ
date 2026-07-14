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
import { readStoredLocale } from "@/lib/i18n";
import { trackInitiateCheckout } from "@/components/MetaPixel";
import { dispatchInitiateCheckoutCapiWithRetry, isMetaInitiateCheckoutCapiComplete } from "@/lib/meta-initiate-checkout-client";
import { reportMetaClientFailure } from "@/lib/meta-client-failure-report";
import {
  ensureMetaFunnelSession,
  touchMetaFunnelActivity,
  touchMetaFunnelActivityThrottled,
} from "@/lib/meta-client";
import { getMetaBrowserCookies } from "@/utils/cookies-client";
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
};

/** Shared content column: comfortable on phones, widens on tablet/desktop without stretching too wide */
const landingShellClass =
  "mx-auto w-full max-w-[min(100%,24rem)] sm:max-w-[min(100%,26rem)] md:max-w-[min(100%,36rem)] lg:max-w-3xl xl:max-w-4xl";

/** Full-bleed strip (translate-centered `100vw`). Physical left/translate keeps centering stable in RTL and LTR. */
const fullBleedStripClass =
  "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2";

/** Title/copy aligned with other sections while the band behind gallery media spans the full viewport. */
const sectionContentInsetClass = `${landingShellClass} px-4 sm:px-6 md:px-8 lg:px-10`;

const primaryCtaClass =
  "store-btn-primary rounded-2xl px-5 py-3.5 text-base font-semibold shadow-[0_16px_36px_rgba(0,107,12,0.28)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.985] sm:px-6 sm:py-4 sm:text-lg sm:font-extrabold";

/** FAQ → Contact strip: full-bleed band behind CTA; pill is centered with capped width (background from admin: image / color / gradient). */
const preContactCtaButtonClass =
  "store-btn-primary mx-auto flex w-full max-w-full justify-center rounded-full px-4 py-1.5 text-sm font-semibold shadow-[0_8px_20px_rgba(0,107,12,0.22)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.985] sm:max-w-[16rem] sm:px-5 sm:py-2 sm:font-bold";

/** Edge-to-edge band behind the pre-contact CTA (pairs with `fullBleedStripClass`). */
const preContactCtaBandClass =
  "relative min-h-[3.25rem] overflow-hidden border-y border-[var(--accent-muted)]/40 shadow-[0_8px_24px_rgba(12,28,12,0.08)] sm:min-h-[3.5rem]";

const sectionPadClass = "px-4 py-9 sm:px-6 sm:py-12 md:px-8 lg:px-10";
const softCardClass =
  "rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] shadow-[0_14px_28px_rgba(12,28,12,0.08)] sm:rounded-[24px]";
const sectionTitleClass =
  "text-center text-xl font-extrabold leading-snug tracking-tight text-[var(--foreground)] sm:text-2xl md:text-[1.75rem] md:leading-tight";
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
    : `translate-y-6 scale-[0.98] ${tiltHidden} opacity-0 sm:translate-y-7`;
  const delayMs = visible ? idx * 115 : 0;

  return (
    <div
      className={`${softCardClass} flex min-h-[120px] flex-col justify-start p-3 text-center transition-[transform,opacity] ${motionFeaturesDurationClass} ${enter} motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:rotate-0 motion-reduce:opacity-100 motion-reduce:transition-none hover:-translate-y-0.5 sm:min-h-[132px] sm:p-4 motion-reduce:hover:translate-y-0`}
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
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)]/25 bg-[var(--accent-muted)]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

function TrustGlyph({ kind }: { kind: "cod" | "delivery" | "guarantee" | "secure" }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5 text-[var(--accent)]",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "cod") {
    return (
      <svg {...common}>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6 9.5h.01M18 14.5h.01" />
      </svg>
    );
  }
  if (kind === "delivery") {
    return (
      <svg {...common}>
        <path d="M3 7h10v8H3zM13 10h4l3 3v2h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </svg>
    );
  }
  if (kind === "secure") {
    return (
      <svg {...common}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LandingTrustBadges({ t }: { t: (key: string) => string }) {
  const items = [
    { kind: "cod" as const, label: t("landing.trustCod") },
    { kind: "delivery" as const, label: t("landing.trustDelivery") },
    { kind: "guarantee" as const, label: t("landing.trustGuarantee") },
    { kind: "secure" as const, label: t("landing.trustSecure") },
  ];

  return (
    <div className="mx-auto mt-5 grid max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.kind}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] px-2 py-3 text-center shadow-[0_8px_18px_rgba(12,28,12,0.06)]"
        >
          <TrustGlyph kind={item.kind} />
          <span className="text-[0.7rem] font-semibold leading-tight text-[var(--foreground)] sm:text-xs">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function GuaranteeStrip({ t }: { t: (key: string) => string }) {
  const title = t("landing.guaranteeTitle");
  const body = t("landing.guaranteeBody");
  return (
    <div className="mx-auto flex max-w-lg items-center gap-3 rounded-3xl border border-[var(--accent-muted)] bg-[linear-gradient(135deg,var(--card)_0%,var(--background)_100%)] p-4 text-start shadow-[0_14px_28px_rgba(12,28,12,0.08)] sm:gap-4 sm:p-5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)] sm:h-14 sm:w-14">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 sm:h-7 sm:w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug text-[var(--foreground)] sm:text-base">
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)] sm:text-sm">{body}</p>
      </div>
    </div>
  );
}

export function ProductLanding({ product }: Props) {
  const { locale, dir, t, setLocale } = useLanguage();
  const copy = useMemo(() => getLocalizedProductCopy(locale, product), [locale, product]);
  const [open, setOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const accent = copy.brandColor;

  const stats = copy.stats;
  const descLines = copy.description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const testimonials = copy.testimonials;
  /** Spotlight above CTA — same source row as admin order #1 */
  const heroTestimonial = testimonials[0] ?? null;
  /** Full reviews section: every admin testimonial once, same order (no wrap-around padding). */
  const sectionTestimonials = testimonials;
  const ratingValues = testimonials
    .map((tItem) => tItem.rating)
    .filter((r): r is number => typeof r === "number" && r > 0);
  const avgRating = ratingValues.length
    ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
    : 5;
  const reviewCount = testimonials.length;

  const featureItems = fixedSlots(copy.features, 4);
  const statItems = fixedSlots(stats, 3);
  const faqItems = fixedSlots(copy.faqs, 4);
  const ctaText = copy.ctaText.trim() || t("landing.ctaDefault");
  const heroSummary = descLines[0] ?? "";
  const codReassurance = descLines[1] ?? t("landing.codReassuranceDefault");

  useEffect(() => {
    const stored = readStoredLocale();
    const defaultLang = product.default_language;
    if (!stored && (defaultLang === "ar" || defaultLang === "fr")) {
      setLocale(defaultLang);
    }
  }, [product.default_language, setLocale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      ensureMetaFunnelSession(product.id);
    } catch {
      // ignore storage errors
    }
  }, [product.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, [product.id]);

  const openCheckout = () => {
    try {
      touchMetaFunnelActivity(product.id);
      const eventId = ensureMetaFunnelSession(product.id);
      if (!eventId) {
        console.error("[meta] InitiateCheckout skipped: missing funnel event_id", {
          productId: product.id,
        });
        setOpen(true);
        return;
      }
      const eventTimeSec = Math.floor(Date.now() / 1000);
      const leadValue =
        product.discount_price != null
          ? Number(product.discount_price)
          : Number(product.price);
      trackInitiateCheckout(eventId, {
        productId: product.id,
        productName: copy.name,
        value: leadValue,
        currency: "MRU",
      });
      const metaCookies = getMetaBrowserCookies();
      void (async () => {
        const capiResult = await dispatchInitiateCheckoutCapiWithRetry({
          productId: product.id,
          eventId,
          eventTimeSec,
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : null,
          metaFbp: metaCookies.fbp,
          metaFbc: metaCookies.fbc,
        });
        if (!isMetaInitiateCheckoutCapiComplete(capiResult)) {
          const reason =
            capiResult.state === "failed" || capiResult.state === "error"
              ? capiResult.reason === "network_error" ||
                  capiResult.reason === "http_error"
                ? capiResult.reason
                : "client_retry_exhausted"
              : "client_retry_exhausted";
          reportMetaClientFailure({
            eventType: "initiate_checkout",
            eventId,
            productId: product.id,
            reason,
            attemptCount: 3,
          });
        }
      })();
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
    ? "opacity-100"
    : "opacity-0";
  const testimonialsHeaderMotion = testimonialsSectionVisible
    ? "translate-y-0 opacity-100"
    : "translate-y-4 opacity-0";

  return (
    <div
      className="storefront-light w-full min-w-0 overflow-x-clip bg-[var(--background)] pb-[max(10rem,calc(7.5rem+env(safe-area-inset-bottom)))] text-[var(--foreground)] md:pb-[max(11.25rem,calc(8.25rem+env(safe-area-inset-bottom)))]"
      dir={dir}
      style={
        {
          "--accent": copy.brandColor,
          "--accent-muted": `color-mix(in srgb, ${copy.brandColor} 34%, white)`,
          "--accent-foreground": "#f0fff0",
          "--background": "#f3f8f3",
          "--foreground": "#0e1a0e",
          "--card": "#f4fff4",
          "--muted": "#4a5c4a",
          "--brand-accent": accent,
        } as CSSProperties
      }
    >
      <div className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        {copy.headerBarText.trim() ? (
          <LandingTopBanner text={copy.headerBarText} bleedClassName={fullBleedStripClass} />
        ) : null}
        <LandingHeader logoSrc={copy.logoUrl} headerCtaText={copy.headerCtaText} />
      </div>

      {/* Hero: title → media → name → description → testimonial → CTA → reassurance */}
      <section
        className="bg-[var(--background)] pb-8 pt-5 text-center sm:pb-10"
        aria-labelledby="hero-title"
      >
        <div className="px-4 sm:px-6 md:px-8">
          <h1 id="hero-title" className={`mx-auto max-w-[34rem] ${heroTitleClass}`}>
            {copy.heroSubtitle}
          </h1>
        </div>

        {/* Full-width media outside section padding so RTL/LTR both stay viewport-centered */}
        <div className="mt-4 w-full sm:mt-5">
          <LandingMedia product={product} priority edgeToEdge primaryHero />
        </div>

        <div className="px-4 sm:px-6 md:px-8">
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

          <LandingTrustBadges t={t} />
        </div>
      </section>

      <section ref={setFeaturesRef} className={`bg-[var(--card)] ${sectionPadClass}`}>
        <h2
          className={`${sectionTitleClass} break-words transition-opacity ${motionFeaturesDurationClass} ${featuresTitleMotion} motion-reduce:opacity-100 motion-reduce:transition-none`}
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
          <h3 className={`${sectionTitleClass} break-words px-1`}>{copy.mediaCaption}</h3>
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
          <h3 className={`${sectionTitleClass} break-words`}>{t("product.gallery")}</h3>
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
        {reviewCount > 0 ? (
          <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-2 shadow-[0_8px_18px_rgba(12,28,12,0.06)]">
            <span className="text-base leading-none text-[var(--accent)]" dir="ltr">
              {starText(avgRating)}
            </span>
            <span className="text-sm font-bold tabular-nums text-[var(--foreground)]" dir="ltr">
              {avgRating.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-[var(--muted)]">
              {t("landing.reviewsVerified", { count: reviewCount })}
            </span>
          </div>
        ) : null}
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

      <section className={`bg-[var(--background)] ${sectionPadClass}`}>
        <GuaranteeStrip t={t} />
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
              <div
                key={`${faq?.q ?? "empty"}-${i}`}
                className={`overflow-hidden rounded-2xl border bg-[var(--background)] transition-colors duration-200 ${opened ? "border-[var(--accent)]/40 shadow-[0_12px_24px_rgba(12,28,12,0.08)]" : "border-[var(--accent-muted)] shadow-sm"}`}
              >
                <button
                  type="button"
                  aria-expanded={opened}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-start sm:px-5 sm:py-5"
                  onClick={() => setOpenFaqIndex((prev) => (prev === i ? null : i))}
                >
                  <span className="break-words text-start text-sm font-semibold leading-snug text-[var(--foreground)] sm:text-base">{faq?.q ?? ""}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform duration-300 ${opened ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
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
              className={`${preContactCtaButtonClass} whitespace-normal break-words text-center leading-snug ${ctaBannerImg ? "ring-2 ring-white/40 shadow-[0_10px_26px_rgba(0,0,0,0.24)]" : ""}`}
            >
              {ctaText}
            </button>
          </div>
        </div>
      </section>

      <LandingStickyFooter
        product={product}
        ctaLabel={ctaText}
        locale={locale}
        onCheckout={openCheckout}
      />

      <OrderFormModal
        product={product}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
