"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { formatPrice } from "@/lib/currency";

const WHATSAPP_HREF = "https://wa.me/22233713957";

type Props = {
  orderId?: string | null;
  productName?: string | null;
  totalPrice?: number | null;
};

export function OrderSuccessContent({
  orderId,
  productName,
  totalPrice,
}: Props) {
  const { t, dir, locale } = useLanguage();

  const hasSummary =
    Boolean(orderId) || Boolean(productName) || (totalPrice != null && Number.isFinite(totalPrice));

  return (
    <div
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center"
      dir={dir}
      lang={locale}
    >
      <div className="store-fade-up w-full overflow-hidden rounded-3xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 shadow-[var(--shadow-md)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] sm:h-20 sm:w-20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-accent)] sm:h-14 sm:w-14">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 sm:h-8 sm:w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <h1 className="mt-5 text-xl font-extrabold leading-snug text-[var(--foreground)] sm:text-2xl">
          {t("orderSuccess.title")}
        </h1>
        <p className="mt-2 text-base font-medium leading-relaxed text-[var(--muted)] sm:text-lg">
          {t("orderSuccess.subtitle")}
        </p>

        {hasSummary ? (
          <dl className="store-card mx-auto mt-6 max-w-md space-y-3 p-4 text-start sm:p-5">
            {orderId ? (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("orderSuccess.orderId")}
                </dt>
                <dd className="font-mono text-sm font-bold text-[var(--foreground)]" dir="ltr">
                  {orderId}
                </dd>
              </div>
            ) : null}
            {productName ? (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("orderSuccess.product")}
                </dt>
                <dd className="text-sm font-semibold text-[var(--foreground)]">{productName}</dd>
              </div>
            ) : null}
            {totalPrice != null && Number.isFinite(totalPrice) ? (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("orderSuccess.total")}
                </dt>
                <dd className="text-lg font-extrabold tabular-nums text-[var(--accent)]" dir="ltr">
                  {formatPrice(totalPrice)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-8 flex justify-center">
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="store-btn-whatsapp max-w-sm"
          >
            {t("orderSuccess.whatsappCta")}
          </a>
        </div>
      </div>
    </div>
  );
}
