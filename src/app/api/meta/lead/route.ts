import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/api-access";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

const bodySchema = z.object({
  order_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) {
    return admin.response;
  }

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

  try {
    const supabase = createServiceClient();
    const result = await dispatchMetaEvent(supabase, parsed.data.order_id, "lead", {
      requestHeaders: request.headers,
    });
    return NextResponse.json({ sent: result.sent, reason: "reason" in result ? result.reason : undefined });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/meta/lead]");
  }
}
