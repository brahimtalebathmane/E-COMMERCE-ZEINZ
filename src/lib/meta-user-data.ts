/**
 * Shared Meta user-data normalization (browser Pixel + server CAPI).
 * Phone: E.164 digits only (country code + number, no "+", spaces, or leading zeros).
 * Name: first whitespace-delimited token → fn; remainder → ln (lowercase for Meta AM).
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */

/** ISO 3166-1 alpha-2 for this storefront (Mauritania). Sent on Pixel init + CAPI. */
export const META_STORE_COUNTRY_CODE = "mr";

/** Meta AM name parts: trim, collapse spaces, lowercase (matches CAPI hash input). */
export function normalizeMetaMatchingNamePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Meta country: lowercase ISO 3166-1 alpha-2. */
export function normalizeMetaMatchingCountry(value?: string | null): string {
  const code = (value ?? META_STORE_COUNTRY_CODE).trim().toLowerCase();
  return code.length === 2 ? code : META_STORE_COUNTRY_CODE;
}

/** First word → fn; remaining words → ln (omitted when empty). */
export function parseCustomerFullName(fullName: string): { fn: string; ln?: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { fn: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) {
    return { fn: normalizeMetaMatchingNamePart(parts[0]) };
  }
  return {
    fn: normalizeMetaMatchingNamePart(parts[0]),
    ln: normalizeMetaMatchingNamePart(parts.slice(1).join(" ")),
  };
}

/**
 * Normalize a WhatsApp / phone value to Meta E.164 digits (e.g. `22230123456`).
 * Strips "+", spaces, dashes; removes leading international "00"; drops leading zeros on the national part when prefixed with country code.
 */
export function sanitizePhoneForMetaE164(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);

  const digits = s.replace(/\D/g, "");
  if (!digits) return null;

  // Mauritania: ensure 222 country code; local 8-digit numbers become 222XXXXXXXX.
  let normalized = digits;
  if (normalized.length === 8 && /^[234]/.test(normalized)) {
    normalized = `222${normalized}`;
  }

  // E.164: 8–15 digits, no leading zero on full number.
  if (normalized.startsWith("0")) normalized = normalized.replace(/^0+/, "");
  if (!/^\d{8,15}$/.test(normalized)) return null;

  return normalized;
}

/**
 * Stable per-shopper key for Meta `external_id`.
 *
 * Meta uses `external_id` to build a persistent identity across events, so the
 * SAME person must always produce the SAME value — an order id (a fresh UUID
 * per order) carries no matching value at all. Derived from the normalized
 * E.164 phone so the browser Pixel and the server CAPI hash identical input.
 * Returns null when the phone can't be normalized; callers then fall back to
 * the order id so the field is never dropped entirely.
 */
export function buildMetaCustomerKey(phone?: string | null): string | null {
  const e164 = phone ? sanitizePhoneForMetaE164(phone) : null;
  return e164 ? `cust_${e164}` : null;
}
