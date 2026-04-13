import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { OrderStatus } from "@/types";
import { sendMetaEvent } from "@/utils/meta";

type Body = {
  status?: OrderStatus;
};

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "cancelled"];

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
}

async function processMetaByStatus(orderId: string) {
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_purchase_sent, meta_cancel_sent",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order || !order.meta_event_id || !order.meta_pixel_id) return;

  if (order.status === "confirmed" && !order.meta_purchase_sent) {
    const sent = await sendMetaEvent({
      pixelId: order.meta_pixel_id,
      eventName: "Purchase",
      eventId: order.meta_event_id,
      eventSourceUrl: order.meta_event_source_url,
      userData: {
        name: order.customer_name,
        phone: order.phone,
      },
      customData: {
        value: Number(order.total_price),
        currency: order.currency ?? "MRU",
      },
    });
    if (sent) {
      await supabase.from("orders").update({ meta_purchase_sent: true }).eq("id", order.id);
    }
    return;
  }

  if (order.status === "cancelled" && !order.meta_cancel_sent) {
    const sent = await sendMetaEvent({
      pixelId: order.meta_pixel_id,
      eventName: "CancelledLead",
      eventId: order.meta_event_id,
      eventSourceUrl: order.meta_event_source_url,
      userData: {
        name: order.customer_name,
        phone: order.phone,
      },
      customData: {
        value: 0,
        currency: "MRU",
        status: "cancelled",
      },
    });
    if (sent) {
      await supabase.from("orders").update({ meta_cancel_sent: true }).eq("id", order.id);
    }
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();
    const { id } = await context.params;
    const orderId = id?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "Order id required" }, { status: 400 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updatePatch: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!ORDER_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updatePatch.status = body.status;
    }

    if (Object.keys(updatePatch).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update(updatePatch)
      .eq("id", orderId)
      .select("id, status")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    after(async () => {
      try {
        await processMetaByStatus(orderId);
      } catch (error) {
        console.error("[PATCH /api/orders/[id]] Meta side effect failed", {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
