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

function envFallbackPixelId(scope: "public" | "server"): string | null {
  if (scope === "public") {
    return normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  }
  return (
    normalizeMetaPixelId(process.env.META_PIXEL_ID) ??
    normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID)
  );
}

/**
 * Resolve Meta Pixel ID for the browser (client components).
 * Product-level ID takes priority; falls back to NEXT_PUBLIC_META_PIXEL_ID.
 */
export function resolvePublicMetaPixelId(productPixelId?: string | null): string | null {
  return normalizeMetaPixelId(productPixelId) ?? envFallbackPixelId("public");
}

/**
 * Resolve Meta Pixel ID on the server (orders, CAPI).
 * Product/order ID takes priority; falls back to META_PIXEL_ID / NEXT_PUBLIC_META_PIXEL_ID.
 */
export function resolveServerMetaPixelId(productPixelId?: string | null): string | null {
  return normalizeMetaPixelId(productPixelId) ?? envFallbackPixelId("server");
}
