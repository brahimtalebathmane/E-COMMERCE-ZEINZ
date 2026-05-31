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

/**
 * Resolve Meta Pixel ID for the browser (client components).
 * Product-level ID takes priority — each landing page can have its own pixel.
 */
export function resolvePublicMetaPixelId(productPixelId?: string | null): string | null {
  return normalizeMetaPixelId(productPixelId);
}

/**
 * Resolve Meta Pixel ID on the server (orders, CAPI).
 * Product/order ID takes priority over any env fallback.
 */
export function resolveServerMetaPixelId(productPixelId?: string | null): string | null {
  return normalizeMetaPixelId(productPixelId);
}
