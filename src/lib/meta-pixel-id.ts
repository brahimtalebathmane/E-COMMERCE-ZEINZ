/**
 * Normalize a Meta Pixel ID from admin input.
 * Strips quotes/spaces; Meta IDs must be numeric only (10–20 digits).
 */
export function normalizeMetaPixelId(raw?: string | null): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Admin paste often includes '123' or "123" — strip repeatedly
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/^['"`]+|['"`]+$/g, "").trim();
    if (next === s) break;
    s = next;
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 20) return digits;

  if (/^\d{10,20}$/.test(s)) return s;

  return null;
}

/** Known DB/API keys that may hold a Meta Pixel ID (multi-tenant product rows). */
const META_PIXEL_ROW_KEYS = [
  "meta_pixel_id",
  "pixel_id",
  "fb_pixel",
  "facebook_pixel_id",
  "metaPixelId",
] as const;

/**
 * Read a raw pixel ID string from a product row before normalization.
 * LEGACY — retained for admin display / historical data only; not used for event routing.
 */
export function extractMetaPixelIdFromRow(
  row: Record<string, unknown>,
): string | null {
  for (const key of META_PIXEL_ROW_KEYS) {
    const value = row[key];
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Unified Meta Pixel ID for the browser (client components).
 * Source: NEXT_PUBLIC_META_PIXEL_ID only — no per-product or server-env fallback.
 */
export function resolvePublicMetaPixelId(): string | null {
  return normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

/**
 * Unified Meta Pixel ID on the server (CAPI).
 * Source: META_PIXEL_ID only — no per-product or public-env fallback.
 */
export function resolveServerMetaPixelId(): string | null {
  return normalizeMetaPixelId(process.env.META_PIXEL_ID);
}
