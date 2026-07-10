import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

export type MetaPixelEnvValidation = {
  /** True when config is usable for both browser and server. */
  ok: boolean;
  /** Hard error — e.g. both env vars set but different IDs. */
  error: string | null;
  browserPixelId: string | null;
  serverPixelId: string | null;
  /** Both set and equal. */
  idsMatch: boolean | null;
  warnings: string[];
};

/**
 * Validates unified Meta Pixel env configuration.
 * No cross-fallback between NEXT_PUBLIC_META_PIXEL_ID and META_PIXEL_ID.
 */
export function validateMetaPixelEnv(): MetaPixelEnvValidation {
  const browserPixelId = normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const serverPixelId = normalizeMetaPixelId(process.env.META_PIXEL_ID);
  const warnings: string[] = [];

  if (!browserPixelId) {
    warnings.push(
      "NEXT_PUBLIC_META_PIXEL_ID is missing — browser Pixel events (PageView, ViewContent, InitiateCheckout, Lead) will not fire.",
    );
  }
  if (!serverPixelId) {
    warnings.push(
      "META_PIXEL_ID is missing — server CAPI events (InitiateCheckout, Lead, Purchase, CancelledLead) will not fire.",
    );
  }

  if (browserPixelId && serverPixelId && browserPixelId !== serverPixelId) {
    return {
      ok: false,
      error: `Meta Pixel ID mismatch: NEXT_PUBLIC_META_PIXEL_ID (${browserPixelId.slice(0, 6)}…) ≠ META_PIXEL_ID (${serverPixelId.slice(0, 6)}…). Events would split across two pixels.`,
      browserPixelId,
      serverPixelId,
      idsMatch: false,
      warnings,
    };
  }

  const idsMatch =
    browserPixelId && serverPixelId ? browserPixelId === serverPixelId : null;

  const ok = Boolean(browserPixelId || serverPixelId) && !(
    browserPixelId &&
    serverPixelId &&
    browserPixelId !== serverPixelId
  );

  return {
    ok,
    error: null,
    browserPixelId,
    serverPixelId,
    idsMatch,
    warnings,
  };
}
