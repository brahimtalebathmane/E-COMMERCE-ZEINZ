import { NextResponse } from "next/server";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";

/**
 * GET /api/meta/health — safe diagnostics (no secrets). Use after deploy to verify Meta config.
 */
export async function GET() {
  const capiToken = Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim());
  const publicPixel = resolveServerMetaPixelId(null);
  const siteUrl = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim());

  const ready = capiToken && Boolean(publicPixel);

  return NextResponse.json({
    ok: ready,
    checks: {
      meta_capi_access_token: capiToken,
      pixel_id_resolved: Boolean(publicPixel),
      pixel_id_prefix: publicPixel ? `${publicPixel.slice(0, 6)}…` : null,
      next_public_site_url: siteUrl,
      meta_capi_version: process.env.META_CAPI_VERSION?.trim() || "v22.0",
    },
    hints: !capiToken
      ? ["Set META_CAPI_ACCESS_TOKEN in Netlify Production env, then redeploy."]
      : !publicPixel
        ? [
            "Set NEXT_PUBLIC_META_PIXEL_ID in Netlify (or meta_pixel_id per product in Admin), then redeploy.",
            "NEXT_PUBLIC_* vars are baked in at build time — changing them requires a new deploy.",
          ]
        : ["Configuration looks present. Test a landing page with Meta Pixel Helper and submit a test order."],
  });
}
