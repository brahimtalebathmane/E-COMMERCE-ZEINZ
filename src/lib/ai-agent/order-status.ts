import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { assertValidOrderTransition } from "@/lib/order-state-machine";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";

const AGENT_ALLOWED_STATUSES: OrderStatus[] = [
  "confirmed",
  "requires_human_intervention",
];

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

  const fromStatus = existing.status as OrderStatus;
  if (fromStatus === status) {
    return { ok: true, status };
  }

  const transition = assertValidOrderTransition(fromStatus, status);
  if (!transition.ok) {
    return { ok: false, error: transition.error };
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
      await dispatchMetaEvent(supabase, orderId, "purchase");
    } catch (e) {
      console.error("[ai-agent] Meta purchase after confirm failed", e);
    }
  }

  revalidatePath("/admin/orders");
  return { ok: true, status };
}
