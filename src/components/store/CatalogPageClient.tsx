"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import {
  CatalogProductCard,
  type CatalogProduct,
} from "@/components/store/CatalogProductCard";

type Props = {
  products: CatalogProduct[];
  configured: boolean;
};

export function CatalogPageClient({ products, configured }: Props) {
  const { t, dir } = useLanguage();

  if (!configured) {
    return (
      <div
        className="mx-auto min-w-0 max-w-3xl overflow-x-clip px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:py-16"
        dir={dir}
      >
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("catalog.configureTitle")}</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {t("catalog.configureHint")}{" "}
          <code className="rounded bg-[var(--accent-muted)]/50 px-1">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          {t("catalog.configureAnd")}{" "}
          <code className="rounded bg-[var(--accent-muted)]/50 px-1">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          {t("catalog.configureSuffix")}
        </p>
      </div>
    );
  }

  const trust = [
    { icon: "cod", label: t("catalog.trustCod") },
    { icon: "delivery", label: t("catalog.trustDelivery") },
    { icon: "support", label: t("catalog.trustSupport") },
    { icon: "secure", label: t("catalog.trustSecure") },
  ] as const;

  return (
    <div className="min-w-0 overflow-x-clip" dir={dir}>
      {/* Premium hero band */}
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--card)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(900px 360px at 100% -10%, var(--accent-soft), transparent 60%), radial-gradient(700px 320px at -10% 120%, var(--accent-soft), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-7 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 sm:pb-9 sm:pt-10 lg:px-8 lg:pb-12 lg:pt-14">
          <span className="store-chip-accent store-fade-up">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            {t("catalog.badge")}
          </span>
          <h1 className="store-fade-up mt-4 max-w-2xl text-[1.7rem] font-extrabold leading-tight tracking-tight text-[var(--foreground)] sm:text-4xl lg:text-[2.75rem]">
            {t("catalog.title")}
          </h1>
          <p className="store-fade-up mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {t("catalog.subtitle")}
          </p>

          <ul className="store-fade-up mt-5 flex flex-wrap gap-2 p-0 sm:mt-6 sm:gap-2.5" role="list">
            {trust.map((item) => (
              <li key={item.icon} className="store-chip list-none">
                <TrustIcon kind={item.icon} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto min-w-0 max-w-7xl overflow-x-clip px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-7 sm:px-6 sm:pt-9 lg:px-8 lg:pt-12">
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{t("catalog.noProducts")}</p>
        ) : (
          <ul
            className="grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7"
            role="list"
          >
            {products.map((p, index) => (
              <CatalogProductCard key={p.slug} product={p} index={index} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TrustIcon({ kind }: { kind: "cod" | "delivery" | "support" | "secure" }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-4 w-4 text-[var(--accent)]",
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
  if (kind === "support") {
    return (
      <svg {...common}>
        <path d="M12 3a9 9 0 0 0-9 9v4a2 2 0 0 0 2 2h1v-6H5a7 7 0 0 1 14 0h-1v6h1a2 2 0 0 0 2-2v-4a9 9 0 0 0-9-9z" />
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
