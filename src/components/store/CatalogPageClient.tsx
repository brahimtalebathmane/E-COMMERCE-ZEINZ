"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

type ProductRow = {
  name: string;
  slug: string;
  discount_price: number | null;
  price: number;
};

type Props = {
  products: ProductRow[];
  configured: boolean;
};

export function CatalogPageClient({ products, configured }: Props) {
  const { t, dir } = useLanguage();

  if (!configured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16" dir={dir}>
        <h1 className="text-3xl font-bold tracking-tight">{t("catalog.configureTitle")}</h1>
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
    <div className="mx-auto max-w-3xl px-4 py-16" dir={dir}>
      <h1 className="text-3xl font-bold tracking-tight">{t("catalog.title")}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("catalog.subtitle")}</p>
      <ul className="mt-10 space-y-3">
        {products.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/${p.slug}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] px-5 py-4 transition hover:border-[var(--accent)]"
            >
              <span className="font-medium">{p.name}</span>
              <span className="shrink-0 text-sm text-[var(--muted)]">
                $
                {(
                  p.discount_price != null
                    ? Number(p.discount_price)
                    : Number(p.price)
                ).toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {products.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{t("catalog.noProducts")}</p>
      ) : null}
      <p className="mt-12 text-center text-xs text-[var(--muted)]">
        <Link href="/admin" className="underline">
          {t("catalog.adminLink")}
        </Link>
      </p>
    </div>
  );
}
