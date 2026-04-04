/**
 * Mauritanian Ouguiya (MRU) — sole currency for this application.
 * All monetary amounts in the database and UI are denominated in MRU.
 */
export const CURRENCY_CODE = "MRU" as const;

/** Display suffix for prices (per product requirements, same as ISO code). */
export const CURRENCY_SYMBOL = "MRU" as const;

/**
 * Formats an amount for display, e.g. `1000 MRU` or `99.5 MRU`.
 */
export function formatPrice(amount: number): string {
  if (!Number.isFinite(amount)) {
    return `0 ${CURRENCY_SYMBOL}`;
  }
  const rounded = Math.round(amount * 100) / 100;
  let numStr: string;
  if (Number.isInteger(rounded)) {
    numStr = String(rounded);
  } else {
    numStr = rounded.toFixed(2).replace(/\.?0+$/, "");
  }
  return `${numStr} ${CURRENCY_SYMBOL}`;
}
