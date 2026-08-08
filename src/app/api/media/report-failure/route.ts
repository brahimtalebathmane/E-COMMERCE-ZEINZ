import { z } from "zod";
import { NextResponse } from "next/server";
import { apiRateLimitError, apiValidationError } from "@/lib/api/errors";
import { checkMediaFailureRateLimit } from "@/lib/rate-limit/media-failure";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveClientIpAddress } from "@/utils/meta";

const reportSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  slot: z.enum(["hero", "secondary", "tertiary", "catalog"]),
  url: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/media/report-failure — logs a broken landing/catalog image so
 * it's discoverable (Layer 3 of the media-reliability chain) instead of a
 * customer silently seeing a broken-image icon. Strictly validated,
 * rate-limited, no DB write (console log only — see structured fields
 * below; grep platform logs for "[media-failure]").
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return apiValidationError("Invalid media failure payload");
  }

  const supabase = createServiceClient();
  const clientIp = resolveClientIpAddress(request.headers);
  const rate = await checkMediaFailureRateLimit(supabase, clientIp);
  if (!rate.allowed) {
    return apiRateLimitError(rate.retryAfterSec);
  }

  const { slug, slot, url } = parsed.data;
  console.error("[media-failure]", { slug, slot, url });

  return NextResponse.json({ ok: true });
}
