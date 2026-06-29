import {
  META_STORE_COUNTRY_CODE,
  normalizeMetaMatchingCountry,
  normalizeMetaMatchingNamePart,
  parseCustomerFullName,
  sanitizePhoneForMetaE164,
} from "@/lib/meta-user-data";
import { getMetaBrowserSessionData } from "@/lib/meta-browser-session";

/**
 * Meta Pixel Advanced Matching helpers (browser pixel only).
 *
 * Send normalized plain text in fbq("init", pixelId, { ph, fn, ln, … }).
 * Meta hashes ph/fn/ln client-side with SHA-256 — do not pre-hash here (double-hash breaks matching).
 * Server CAPI hashes the same normalized values in src/utils/meta.ts.
 */

export type MetaPixelAdvancedMatchingPayload = {
  ph?: string;
  fn?: string;
  ln?: string;
  country?: string;
  fbp?: string;
  fbc?: string;
  /** Pre-hashed SHA-256 — must match CAPI `external_id` for the same order id. */
  external_id?: string;
};

/** Re-export for callers that import from this module. */
export { parseCustomerFullName as splitCustomerName, sanitizePhoneForMetaE164 as normalizePhoneForMetaPixel };

/** Build payload for fbq init / set userData — only non-empty fields. */
export function buildMetaPixelAdvancedMatching(input: {
  phone: string;
  customerName: string;
  fbp?: string | null;
  fbc?: string | null;
  /** Pre-hashed SHA-256 order id — aligns with CAPI `external_id`. */
  externalIdHash?: string | null;
}): MetaPixelAdvancedMatchingPayload | undefined {
  const ph = sanitizePhoneForMetaE164(input.phone) ?? undefined;
  const { fn, ln } = parseCustomerFullName(input.customerName);
  const out: MetaPixelAdvancedMatchingPayload = {};
  if (ph) out.ph = ph;
  if (fn) out.fn = fn;
  if (ln) out.ln = ln;
  out.country = normalizeMetaMatchingCountry(META_STORE_COUNTRY_CODE);
  const fbp = input.fbp?.trim();
  const fbc = input.fbc?.trim();
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  const externalId = input.externalIdHash?.trim();
  if (externalId) out.external_id = externalId;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function metaPixelAmStorageKey(pixelId: string): string {
  return `meta_pixel_am:${pixelId}`;
}

/** Read phone/name advanced matching saved after a prior order on this device. */
export function loadStoredMetaPixelAdvancedMatching(
  pixelId: string,
): MetaPixelAdvancedMatchingPayload | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(metaPixelAmStorageKey(pixelId))?.trim();
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MetaPixelAdvancedMatchingPayload;
    const out: MetaPixelAdvancedMatchingPayload = {};
    const ph = parsed.ph?.trim() ? sanitizePhoneForMetaE164(parsed.ph) : null;
    if (ph) out.ph = ph;
    if (parsed.fn?.trim()) out.fn = normalizeMetaMatchingNamePart(parsed.fn);
    if (parsed.ln?.trim()) out.ln = normalizeMetaMatchingNamePart(parsed.ln);
    out.country = normalizeMetaMatchingCountry(parsed.country);
    if (parsed.fbp?.trim()) out.fbp = parsed.fbp.trim();
    if (parsed.fbc?.trim()) out.fbc = parsed.fbc.trim();
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Third `fbq("init", …)` parameter: stored PII + live fbp/fbc cookies. */
export function buildMetaPixelInitUserData(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): Record<string, string> | undefined {
  const cookies = getMetaBrowserSessionData();
  const stored = loadStoredMetaPixelAdvancedMatching(pixelId);
  const merged: MetaPixelAdvancedMatchingPayload = {
    fbp: cookies.fbp,
    fbc: cookies.fbc,
    ...stored,
    ...extra,
  };
  const out: Record<string, string> = {};
  if (merged.ph?.trim()) out.ph = merged.ph.trim();
  if (merged.fn?.trim()) out.fn = merged.fn.trim();
  if (merged.ln?.trim()) out.ln = merged.ln.trim();
  out.country = normalizeMetaMatchingCountry(merged.country);
  if (merged.fbp?.trim()) out.fbp = merged.fbp.trim();
  if (merged.fbc?.trim()) out.fbc = merged.fbc.trim();
  if (merged.external_id?.trim()) out.external_id = merged.external_id.trim();
  return out;
}
