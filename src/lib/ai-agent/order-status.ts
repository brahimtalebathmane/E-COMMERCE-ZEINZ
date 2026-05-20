import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { createMetaEventId, sendMetaEvent } from "@/utils/meta";

const AGENT_ALLOWED_STATUSES: OrderStatus[] = [
  "confirmed",
  "requires_human_intervention",
];

function resolveFallbackPixelId(): string | null {
  return process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;
}

async function sendMetaPurchaseIfNeeded(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_purchase_sent, meta_fbp, meta_fbc",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order || order.status !== "confirmed" || order.meta_purchase_sent) return;

  let eventId = order.meta_event_id?.trim() || "";
  const pixelId = order.meta_pixel_id?.trim() || resolveFallbackPixelId() || "";
  if (!eventId) {
    eventId = createMetaEventId();
    await supabase.from("orders").update({ meta_event_id: eventId }).eq("id", order.id);
  }
  if (!order.meta_pixel_id && pixelId) {
    await supabase.from("orders").update({ meta_pixel_id: pixelId }).eq("id", order.id);
  }
  if (!eventId || !pixelId) return;

  const capi = await sendMetaEvent({
    pixelId,
    eventName: "Purchase",
    eventId,
    eventSourceUrl: order.meta_event_source_url,
    requestHeaders: new Headers(),
    userData: {
      name: order.customer_name,
      phone: order.phone,
      fbp: order.meta_fbp,
      fbc: order.meta_fbc,
      clientIpAddress: null,
      clientUserAgent: null,
    },
    customData: metaPurchaseMoneyFromOrderTotal(
      Number(order.total_price),
      order.currency ?? "MRU",
    ),
  });

  if (capi.ok) {
    await supabase
      .from("orders")
      .update({ meta_purchase_sent: true })
      .eq("id", order.id)
      .eq("meta_purchase_sent", false);
  }
}

export type AgentStatusUpdateResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

export async function applyAgentOrderStatusUpdate(
  supabase: SupabaseClient,
  orderId: string,
  status: OrderStatus,
  detail?: string | null,
): Promise<AgentStatusUpdateResult> {
  if (!AGENT_ALLOWED_STATUSES.includes(status)) {
    return { ok: false, error: "Status not allowed for agent" };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "Order not found" };

  if (existing.status === "confirmed" && status === "confirmed") {
    return { ok: true, status: "confirmed" };
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (updateErr) return { ok: false, error: updateErr.message };

  const event =
    status === "confirmed" ? "ai_agent_confirmed" : "ai_agent_human_escalation";
  await logOrderCommunicationEvent(supabase, orderId, event, detail ?? null);

  if (status === "confirmed") {
    try {
      await sendMetaPurchaseIfNeeded(supabase, orderId);
    } catch (e) {
      console.error("[ai-agent] Meta purchase after confirm failed", e);
    }
  }

  revalidatePath("/admin/orders");
  return { ok: true, status };
}
