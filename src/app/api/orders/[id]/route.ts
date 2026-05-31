import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { OrderStatus } from "@/types";
import { assertAdminUser, AuthError } from "@/lib/auth/admin";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { assertValidOrderTransition } from "@/lib/order-state-machine";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "cancelled",
  "requires_human_intervention",
];

const patchBodySchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "shipped",
    "cancelled",
    "requires_human_intervention",
  ]),
});

/** Returned on PATCH when status becomes `confirmed` so the admin UI can confirm CAPI delivery. */
type MetaPurchaseCapiPayload =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | {
      state: "failed";
      reason: string;
    };

function mapDispatchToPurchasePayload(
  result: Awaited<ReturnType<typeof dispatchMetaEvent>>,
): MetaPurchaseCapiPayload | undefined {
  if (result.sent) return { state: "sent" };
  if ("skipped" in result && result.skipped) {
    if (result.reason === "already_sent") {
      return { state: "skipped", reason: "already_sent" };
    }
    return { state: "skipped", reason: result.reason };
  }
  return { state: "failed", reason: "reason" in result ? result.reason : "capi_failed" };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdminUser();
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

    const nextStatus = parsed.data.status;
    if (!ORDER_STATUSES.includes(nextStatus)) {
      return apiValidationError("Invalid status");
    }

    const supabase = createServiceClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const fromStatus = existing.status as OrderStatus;
    const transition = assertValidOrderTransition(fromStatus, nextStatus);
    if (!transition.ok) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId)
      .select("id, status")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let meta: { purchase?: MetaPurchaseCapiPayload } = {};
    try {
      if (updated.status === "confirmed") {
        const purchaseResult = await dispatchMetaEvent(supabase, orderId, "purchase", {
          requestHeaders: request.headers,
        });
        meta = { purchase: mapDispatchToPurchasePayload(purchaseResult) };
      } else if (updated.status === "cancelled") {
        await dispatchMetaEvent(supabase, orderId, "cancel", {
          requestHeaders: request.headers,
        });
      }
    } catch (error) {
      console.error("[PATCH /api/orders/[id]] Meta processing failed", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const responsePayload: {
      success: true;
      order: typeof updated;
      meta?: { purchase?: MetaPurchaseCapiPayload };
    } = { success: true, order: updated };
    if (updated.status === "confirmed" && meta.purchase) {
      responsePayload.meta = { purchase: meta.purchase };
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return apiErrorResponse(error, "[PATCH /api/orders/[id]]");
  }
}
