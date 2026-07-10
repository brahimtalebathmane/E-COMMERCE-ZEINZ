import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateMetaPixelEnv } from "@/lib/meta-pixel-config";

/**
 * GET /api/meta/health — safe diagnostics (no secrets). Use after deploy to verify Meta config.
 */
export async function GET() {
  const pixelEnv = validateMetaPixelEnv();
  const capiToken = Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim());
  const testEventCode = Boolean(process.env.META_CAPI_TEST_EVENT_CODE?.trim());
  const siteUrl = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim());

  let legacyProductPixelCount: number | null = null;
  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .not("meta_pixel_id", "is", null)
      .is("deleted_at", null);
    if (!error) legacyProductPixelCount = count ?? 0;
  } catch {
    legacyProductPixelCount = null;
  }

  const hasHardError = Boolean(pixelEnv.error);
  const ready = !hasHardError && capiToken && Boolean(pixelEnv.browserPixelId || pixelEnv.serverPixelId);

  const hints: string[] = [];
  if (pixelEnv.error) {
    hints.push(pixelEnv.error);
  }
  hints.push(...pixelEnv.warnings);
  if (!capiToken) {
    hints.push("Set META_CAPI_ACCESS_TOKEN in Netlify Production env, then redeploy.");
  }
  if (!testEventCode) {
    hints.push(
      "Set META_CAPI_TEST_EVENT_CODE to see server events in Events Manager → Test Events.",
    );
  }
  if (!siteUrl) {
    hints.push("Set NEXT_PUBLIC_SITE_URL for reliable CAPI event_source_url fallback.");
  }
  if (legacyProductPixelCount != null && legacyProductPixelCount > 0) {
    hints.push(
      `Legacy notice: ${legacyProductPixelCount} product(s) still have meta_pixel_id set in DB — ignored for routing (unified env pixel only).`,
    );
  }
  if (ready && hints.length === 0) {
    hints.push(
      "Unified Meta Pixel configuration looks complete. Test with Pixel Helper and submit a test order.",
    );
  }

  return NextResponse.json({
    ok: ready,
    error: pixelEnv.error,
    checks: {
      meta_capi_access_token: capiToken,
      meta_capi_test_event_code: testEventCode,
      next_public_meta_pixel_id: Boolean(pixelEnv.browserPixelId),
      meta_pixel_id: Boolean(pixelEnv.serverPixelId),
      pixel_ids_match: pixelEnv.idsMatch,
      browser_pixel_id_prefix: pixelEnv.browserPixelId
        ? `${pixelEnv.browserPixelId.slice(0, 6)}…`
        : null,
      server_pixel_id_prefix: pixelEnv.serverPixelId
        ? `${pixelEnv.serverPixelId.slice(0, 6)}…`
        : null,
      next_public_site_url: siteUrl,
      meta_capi_version: process.env.META_CAPI_VERSION?.trim() || "v22.0",
      legacy_products_with_meta_pixel_id: legacyProductPixelCount,
    },
    hints,
  });
}
