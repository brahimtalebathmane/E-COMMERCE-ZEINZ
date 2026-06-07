/**
 * Shared Meta user-data normalization (browser Pixel + server CAPI).
 * Phone: E.164 digits only (country code + number, no "+", spaces, or leading zeros).
 * Name: first whitespace-delimited token → fn; remainder → ln.
 */

/** First word → fn; remaining words → ln (omitted when empty). */
export function parseCustomerFullName(fullName: string): { fn: string; ln?: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { fn: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { fn: parts[0] };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
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
