import {
  parseCustomerFullName,
  sanitizePhoneForMetaE164,
} from "@/lib/meta-user-data";

/**
 * Meta Pixel Advanced Matching helpers (browser pixel only).
 * Values are sent in plain text; Meta hashes client-side.
 */

export type MetaPixelAdvancedMatchingPayload = {
  ph?: string;
  fn?: string;
  ln?: string;
  fbp?: string;
  fbc?: string;
};

/** Re-export for callers that import from this module. */
export { parseCustomerFullName as splitCustomerName, sanitizePhoneForMetaE164 as normalizePhoneForMetaPixel };

/** Build payload for fbq init / set userData — only non-empty fields. */
export function buildMetaPixelAdvancedMatching(input: {
  phone: string;
  customerName: string;
  fbp?: string | null;
  fbc?: string | null;
}): MetaPixelAdvancedMatchingPayload | undefined {
  const ph = sanitizePhoneForMetaE164(input.phone) ?? undefined;
  const { fn, ln } = parseCustomerFullName(input.customerName);
  const out: MetaPixelAdvancedMatchingPayload = {};
  if (ph) out.ph = ph;
  if (fn) out.fn = fn;
  if (ln) out.ln = ln;
  const fbp = input.fbp?.trim();
  const fbc = input.fbc?.trim();
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function metaPixelAmStorageKey(pixelId: string): string {
  return `meta_pixel_am:${pixelId}`;
}
