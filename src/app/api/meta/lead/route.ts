import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminOrOrderAction } from "@/lib/auth/api-access";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { mapLeadDispatchToApiPayload } from "@/lib/meta/api-payload";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

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

  try {
    const supabase = createServiceClient();
    const result = await dispatchMetaEvent(supabase, parsed.data.order_id, "lead", {
      requestHeaders: request.headers,
    });
    const lead = mapLeadDispatchToApiPayload(result);
    console.warn("[POST /api/meta/lead] Meta Lead CAPI", {
      order_id: parsed.data.order_id,
      via: access.via,
      lead,
    });
    return NextResponse.json({ lead });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/meta/lead]");
  }
}
