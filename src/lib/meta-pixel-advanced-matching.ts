/**
 * Meta Pixel Advanced Matching helpers (browser pixel only).
 * Phone is normalized per Meta-friendly rules: strip spaces, leading +, leading 00, keep digits.
 */

export type MetaPixelAdvancedMatchingPayload = {
  ph?: string;
  fn?: string;
  ln?: string;
};

/** Remove spaces, "+", and leading international "00"; keep digits only for matching. */
export function normalizePhoneForMetaPixel(raw: string): string {
  let s = raw.trim().replace(/\s+/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  return s.replace(/\D/g, "");
}

/** Split full name: first token → fn, remainder → ln (omit ln if empty). */
export function splitCustomerName(customerName: string): {
  fn?: string;
  ln?: string;
} {
  const trimmed = customerName.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { fn: parts[0] };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

/** Build payload for fbq init / set userData — only non-empty fields. */
export function buildMetaPixelAdvancedMatching(input: {
  phone: string;
  customerName: string;
}): MetaPixelAdvancedMatchingPayload | undefined {
  const ph = normalizePhoneForMetaPixel(input.phone);
  const { fn, ln } = splitCustomerName(input.customerName);
  const out: MetaPixelAdvancedMatchingPayload = {};
  if (ph) out.ph = ph;
  if (fn) out.fn = fn;
  if (ln) out.ln = ln;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function metaPixelAmStorageKey(pixelId: string): string {
  return `meta_pixel_am:${pixelId}`;
}
