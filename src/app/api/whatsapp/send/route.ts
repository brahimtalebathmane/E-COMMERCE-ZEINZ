import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminOrOrderAction } from "@/lib/auth/api-access";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { dispatchPostOrderWhatsApp } from "@/lib/whatsapp/post-order-dispatch";

const bodySchema = z.object({
  order_id: z.string().uuid(),
  completion_token: z.string().uuid().optional(),
  action_token: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiValidationError("order_id required");
  }

  const access = await requireAdminOrOrderAction({
    order_id: parsed.data.order_id,
    completion_token: parsed.data.completion_token,
    action_token: parsed.data.action_token,
  });
  if (!access.ok) {
    return access.response;
  }

  const orderId = parsed.data.order_id.trim();
  console.log("[POST /api/whatsapp/send] WhatsApp message trigger", { orderId, via: access.via });

  try {
    const supabase = createServiceClient();
    const result = await dispatchPostOrderWhatsApp(supabase, orderId);

    if (result.handled && !result.sent) {
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: result.skipReason,
        hint: "hint" in result ? result.hint : undefined,
      });
    }
    if (!result.handled) {
      return NextResponse.json(
        {
          handled: false,
          sent: false,
          error: result.error,
          retryable: result.retryable,
        },
        { status: result.retryable ? 503 : 500 },
      );
    }

    return NextResponse.json({ handled: true, sent: true });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/whatsapp/send]");
  }
}
