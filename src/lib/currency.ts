/**
 * Mauritanian Ouguiya (MRU) — sole currency for this application.
 * All monetary amounts in the database and UI are denominated in MRU.
 */
export const CURRENCY_CODE = "MRU" as const;

/** Display suffix for prices (per product requirements, same as ISO code). */
export const CURRENCY_SYMBOL = "MRU" as const;

/**
 * Formats an amount in an arbitrary ISO-ish currency code, e.g. `1000 KWD`.
 * Affiliate products carry their own currency (never MRU) — this is used for
 * their landing pages, orders, and profit reporting so affiliate amounts are
 * never silently mislabeled as MRU. Owned products keep using `formatPrice`.
 */
export function formatMoney(amount: number, currencyCode: string): string {
  const code = currencyCode.trim().toUpperCase() || CURRENCY_SYMBOL;
  if (!Number.isFinite(amount)) {
    return `0 ${code}`;
  }
  const rounded = Math.round(amount * 100) / 100;
  let numStr: string;
  if (Number.isInteger(rounded)) {
    numStr = String(rounded);
  } else {
    numStr = rounded.toFixed(2).replace(/\.?0+$/, "");
  }
  return `${numStr} ${code}`;
}

/**
 * Formats an amount for display, e.g. `1000 MRU` or `99.5 MRU`.
 */
export function formatPrice(amount: number): string {
  return formatMoney(amount, CURRENCY_SYMBOL);
}

const DEFAULT_META_MRU_USD_RATE = 0.026;

/**
 * Meta's browser Pixel often rejects MRU for standard Purchase events even though it is valid ISO 4217.
 * Map to USD for the pixel only. Optional `NEXT_PUBLIC_META_MRU_USD_RATE`: multiply MRU amount by this to get USD (e.g. 0.025 if ~40 MRU = 1 USD).
 */
export function toMetaPixelPurchaseMoney(
  amountLocal: number,
  isoCurrency: string,
): { value: number; currency: string } {
  const code = isoCurrency.trim().toUpperCase();
  if (code !== "MRU") {
    return { value: amountLocal, currency: code };
  }
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_META_MRU_USD_RATE : undefined;
  const mult =
    raw != null && raw !== "" ? Number(raw) : DEFAULT_META_MRU_USD_RATE;
  const factor = Number.isFinite(mult) && mult > 0 ? mult : DEFAULT_META_MRU_USD_RATE;
  return {
    value: Math.round(amountLocal * factor * 100) / 100,
    currency: "USD",
  };
}
