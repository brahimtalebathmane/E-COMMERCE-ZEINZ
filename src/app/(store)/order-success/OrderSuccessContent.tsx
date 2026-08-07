"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { formatMoneyLabel, resolveDisplayCurrency } from "@/lib/currency";

const WHATSAPP_HREF = "https://wa.me/22233713957";

function ReassuranceRow({
  icon,
  text,
}: {
  icon: "whatsapp" | "delivery";
  text: string;
}) {
  return (
    <div className="store-card flex items-center gap-3 p-3 text-start sm:p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon === "whatsapp" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3a8 8 0 0 0-6.93 12.02L4 21l6.13-1.03A8 8 0 1 0 12 3z" />
            <path d="M8.5 9.5c.3 2.5 2.5 4.7 5 5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7h10v8H3z" />
            <path d="M13 10h4l3 3v2h-7z" />
            <circle cx="7" cy="18" r="1.6" />
            <circle cx="17" cy="18" r="1.6" />
          </svg>
        )}
      </span>
      <p className="text-sm font-semibold leading-snug text-[var(--foreground)]">{text}</p>
    </div>
  );
}

type Props = {
  orderId?: string | null;
  productName?: string | null;
  totalPrice?: number | null;
  /** affiliate orders are confirmed/shipped by COD Partner by phone — no WhatsApp CTA to show. */
  fulfillmentType?: string | null;
  /** Order's own currency (e.g. "SAR" for an affiliate order) — never assume MRU. */
  currency?: string | null;
  /** Display-only currency label (products.display_currency); null falls back to `currency`. Never use for Meta events. */
  displayCurrency?: string | null;
};

export function OrderSuccessContent({
  orderId,
  productName,
  totalPrice,
  fulfillmentType,
  currency,
  displayCurrency,
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
                  {formatMoneyLabel(totalPrice, resolveDisplayCurrency(displayCurrency, currency || "MRU"))}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {fulfillmentType !== "affiliate" ? (
          <>
            <div className="mx-auto mt-6 max-w-md space-y-2.5">
              <ReassuranceRow icon="whatsapp" text={t("orderSuccess.whatsappConfirmationNotice")} />
              <ReassuranceRow icon="delivery" text={t("orderSuccess.fastDeliveryNotice")} />
            </div>
            <div className="mt-6 flex justify-center">
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="store-btn-whatsapp max-w-sm"
              >
                {t("orderSuccess.whatsappCta")}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
