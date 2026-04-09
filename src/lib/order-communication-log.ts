import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderCommunicationEvent =
  | "order_created"
  | "whatsapp_triggered"
  | "whatsapp_sent"
  | "whatsapp_skipped"
  | "whatsapp_failed";

export async function logOrderCommunicationEvent(
  supabase: SupabaseClient,
  orderId: string,
  event: OrderCommunicationEvent,
  detail?: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from("order_communication_logs").insert({
      order_id: orderId,
      event,
      detail: detail?.slice(0, 2000) ?? null,
    });
    if (error) {
      console.error("[order_communication_logs] insert failed", error.message);
    }
  } catch (e) {
    console.error("[order_communication_logs]", e);
  }
}
