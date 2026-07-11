import { z } from "zod";
import { NextResponse } from "next/server";
import { apiRateLimitError, apiValidationError } from "@/lib/api/errors";
import { logMetaEventOutcome } from "@/lib/meta/event-log";
import { checkMetaClientFailureRateLimit } from "@/lib/rate-limit/meta-client-failure";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveClientIpAddress } from "@/utils/meta";

const clientFailureSchema = z.object({
  eventType: z.enum(["lead", "initiate_checkout"]),
  eventId: z.string().trim().min(1).max(128),
  orderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  reason: z.enum([
    "capi_failed",
    "client_retry_exhausted",
    "http_error",
    "network_error",
    "missing_meta_data",
    "error",
  ]),
  attemptCount: z.number().int().min(1).max(5).optional(),
});

/**
 * POST /api/meta/client-failure — logs browser-side Meta CAPI retry exhaustion.
 * Strictly validated, rate-limited, no sensitive data returned.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = clientFailureSchema.safeParse(raw);
  if (!parsed.success) {
    return apiValidationError("Invalid client failure payload");
  }

  const supabase = createServiceClient();
  const clientIp = resolveClientIpAddress(request.headers);
  const rate = await checkMetaClientFailureRateLimit(supabase, clientIp);
  if (!rate.allowed) {
    return apiRateLimitError(rate.retryAfterSec);
  }

  const body = parsed.data;
  await logMetaEventOutcome({
    supabase,
    eventType: body.eventType,
    eventId: body.eventId,
    orderId: body.orderId ?? null,
    productId: body.productId ?? null,
    state: "failed",
    reason: body.reason,
    attemptCount: body.attemptCount ?? 3,
  });

  return NextResponse.json({ ok: true });
}
