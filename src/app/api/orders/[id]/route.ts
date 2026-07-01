import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { assertPermission, AuthError } from "@/lib/auth/admin";
import {
  canChangeOrderStatus,
  PERMISSIONS,
} from "@/lib/auth/permissions";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import {
  updateOrderStatusWithEffects,
  type MetaSideEffect,
} from "@/lib/orders/update-status";

const patchBodySchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "shipped",
    "cancelled",
    "requires_human_intervention",
    "internal_return",
  ]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertPermission(PERMISSIONS.view_orders);
    const { id } = await context.params;
    const orderId = id?.trim();
    if (!orderId) {
      return apiValidationError("Order id required");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiValidationError("Invalid JSON");
    }

    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiValidationError("Invalid status");
    }

    if (!canChangeOrderStatus(session.access, parsed.data.status)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createServiceClient();

    const result = await updateOrderStatusWithEffects(
      supabase,
      orderId,
      parsed.data.status,
      {
        requestHeaders: request.headers,
        changedBy: session.access.userId,
      },
    );

    if (!result.ok) {
      if (result.code === "not_found") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (result.code === "invalid_transition") {
        return NextResponse.json(
          { error: "Invalid status transition" },
          { status: 409 },
        );
      }
      throw new Error(result.error);
    }

    const responsePayload: {
      success: true;
      order: { id: string; status: string };
      meta?: { purchase?: MetaSideEffect; cancel?: MetaSideEffect };
    } = {
      success: true,
      order: { id: result.orderId, status: result.toStatus },
    };

    if (result.toStatus === "confirmed" && result.metaPurchase) {
      responsePayload.meta = { ...responsePayload.meta, purchase: result.metaPurchase };
    }
    if (result.toStatus === "cancelled" && result.metaCancel) {
      responsePayload.meta = { ...responsePayload.meta, cancel: result.metaCancel };
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return apiErrorResponse(error, "[PATCH /api/orders/[id]]");
  }
}
