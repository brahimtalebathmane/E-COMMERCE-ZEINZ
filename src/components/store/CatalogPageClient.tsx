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

  return (
    <div
      className="mx-auto min-w-0 max-w-7xl overflow-x-clip px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10 lg:px-8 lg:pt-14"
      dir={dir}
    >
      <header className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
          {t("catalog.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          {t("catalog.subtitle")}
        </p>
      </header>

      {products.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--muted)]">{t("catalog.noProducts")}</p>
      ) : (
        <ul
          className="mt-8 grid list-none grid-cols-1 gap-5 p-0 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8"
          role="list"
        >
          {products.map((p, index) => (
            <CatalogProductCard key={p.slug} product={p} index={index} />
          ))}
        </ul>
      )}
    </div>
  );
}
