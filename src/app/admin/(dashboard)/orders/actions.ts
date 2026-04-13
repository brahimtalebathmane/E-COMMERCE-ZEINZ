"use server";

import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";
import { revalidatePath } from "next/cache";
import { sendMetaEvent } from "@/utils/meta";

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
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return supabase;
}

export async function updateOrderStatusAction(id: string, status: OrderStatus) {
  const supabase = await assertAdmin();
  const { data: currentOrder, error: currentOrderError } = await supabase
    .from("orders")
    .select(
      "id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_purchase_sent, meta_cancel_sent",
    )
    .eq("id", id)
    .maybeSingle();

  if (currentOrderError) throw new Error(currentOrderError.message);
  if (!currentOrder) throw new Error("Order not found");

  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  try {
    if (
      status === "confirmed" &&
      !currentOrder.meta_purchase_sent &&
      currentOrder.meta_event_id &&
      currentOrder.meta_pixel_id
    ) {
      const purchaseSent = await sendMetaEvent({
        pixelId: currentOrder.meta_pixel_id,
        eventName: "Purchase",
        eventId: currentOrder.meta_event_id,
        eventSourceUrl: currentOrder.meta_event_source_url,
        userData: {
          name: currentOrder.customer_name,
          phone: currentOrder.phone,
        },
        customData: {
          value: Number(currentOrder.total_price),
          currency: currentOrder.currency ?? "MRU",
        },
      });
      if (purchaseSent) {
        await supabase.from("orders").update({ meta_purchase_sent: true }).eq("id", id);
      }
    }

    if (
      status === "cancelled" &&
      !currentOrder.meta_cancel_sent &&
      currentOrder.meta_event_id &&
      currentOrder.meta_pixel_id
    ) {
      const cancelSent = await sendMetaEvent({
        pixelId: currentOrder.meta_pixel_id,
        eventName: "CancelledLead",
        eventId: `${currentOrder.meta_event_id}_cancel`,
        eventSourceUrl: currentOrder.meta_event_source_url,
        userData: {
          name: currentOrder.customer_name,
          phone: currentOrder.phone,
        },
        customData: {
          value: 0,
          currency: "MRU",
          status: "cancelled",
        },
      });
      if (cancelSent) {
        await supabase.from("orders").update({ meta_cancel_sent: true }).eq("id", id);
      }
    }
  } catch (metaError) {
    console.error("[updateOrderStatusAction] Meta tracking failed", {
      orderId: id,
      status,
      error: metaError instanceof Error ? metaError.message : String(metaError),
    });
  }

  revalidatePath("/admin/orders");
}

export async function deleteOrderAction(id: string) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
}
