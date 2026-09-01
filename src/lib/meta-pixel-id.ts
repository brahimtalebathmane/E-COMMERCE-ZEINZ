import type { SupabaseClient } from "@supabase/supabase-js";

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
 * LEGACY — retained for admin display / historical data only. Event routing
 * now goes through the product's country (countries.meta_pixel_id_public/
 * server via resolveCountryPixelIds), not this per-row column.
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
 * Meta Pixel ID for the browser (client components).
 * Prefers the product's country pixel (see resolveCountryPixelIds); falls
 * back to the site-wide NEXT_PUBLIC_META_PIXEL_ID env var while a country
 * has no pixel configured yet in the Countries admin screen.
 */
export function resolvePublicMetaPixelId(countryPixelId?: string | null): string | null {
  return (
    normalizeMetaPixelId(countryPixelId) ??
    normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID)
  );
}

/**
 * Meta Pixel ID on the server (CAPI).
 * Prefers the product's country pixel (see resolveCountryPixelIds); falls
 * back to the site-wide META_PIXEL_ID env var while a country has no pixel
 * configured yet in the Countries admin screen.
 */
export function resolveServerMetaPixelId(countryPixelId?: string | null): string | null {
  return (
    normalizeMetaPixelId(countryPixelId) ??
    normalizeMetaPixelId(process.env.META_PIXEL_ID)
  );
}

export type CountryPixelIds = { public: string | null; server: string | null; isoCode: string | null };

/**
 * Looks up a country's own Meta Pixel IDs (public + server) by id. Returns
 * both null when countryId is unset or the country has none configured yet
 * — callers should then fall back to resolvePublicMetaPixelId()/
 * resolveServerMetaPixelId() with no argument (env-var pixel).
 */
export async function resolveCountryPixelIds(
  supabase: SupabaseClient,
  countryId: string | null | undefined,
): Promise<CountryPixelIds> {
  if (!countryId) return { public: null, server: null, isoCode: null };

  const { data } = await supabase
    .from("countries")
    .select("meta_pixel_id_public, meta_pixel_id_server, iso_code")
    .eq("id", countryId)
    .maybeSingle();

  const row = data as {
    meta_pixel_id_public?: string | null;
    meta_pixel_id_server?: string | null;
    iso_code?: string | null;
  } | null;
  const rawIsoCode = row?.iso_code?.trim().toLowerCase() ?? null;
  return {
    public: normalizeMetaPixelId(row?.meta_pixel_id_public),
    server: normalizeMetaPixelId(row?.meta_pixel_id_server),
    isoCode: rawIsoCode && rawIsoCode.length === 2 ? rawIsoCode : null,
  };
}
