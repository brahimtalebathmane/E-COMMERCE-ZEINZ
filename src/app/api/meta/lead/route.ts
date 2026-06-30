import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/api-access";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { mapLeadDispatchToApiPayload } from "@/lib/meta/api-payload";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

const bodySchema = z.object({
  order_id: z.string().uuid(),
});

/** Admin manual retry for Lead CAPI. Storefront uses POST /api/orders/meta/lead. */
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
    const lead = mapLeadDispatchToApiPayload(result);
    console.warn("[POST /api/meta/lead] Meta Lead CAPI (admin retry)", {
      order_id: parsed.data.order_id,
      lead,
    });
    return NextResponse.json({ lead });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/meta/lead]");
  }
}
