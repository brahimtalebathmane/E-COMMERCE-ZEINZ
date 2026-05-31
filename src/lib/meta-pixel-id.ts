/**
 * Normalize a Meta Pixel ID from admin input (digits only; Meta IDs are numeric).
 */
export function normalizeMetaPixelId(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) return digits;
  return trimmed;
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
