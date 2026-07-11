import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  logMetaEventOutcome,
  mapDispatchEventTypeToLog,
  type MetaEventLogType,
} from "@/lib/meta/event-log";
import { resolveLeadEventId } from "@/lib/meta-lead-event-id";

const PURCHASE_STUCK_MINUTES = 30;
const CANCEL_STUCK_MINUTES = 30;
const LEAD_STUCK_MINUTES = 90;

export type StuckMetaEvent = {
  orderId: string;
  productId: string | null;
  eventType: MetaEventLogType;
  dispatchType: "lead" | "purchase" | "cancel";
  eventId: string;
  reason: "stuck_timeout";
};

async function resolveStatusSince(
  supabase: SupabaseClient,
  orderId: string,
  status: string,
  fallbackIso: string,
): Promise<string> {
  const { data } = await supabase
    .from("order_status_history")
    .select("created_at")
    .eq("order_id", orderId)
    .eq("new_status", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? fallbackIso;
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function purchaseEventId(orderId: string): string {
  return `purchase_${orderId}`;
}

function cancelEventId(orderId: string): string {
  return `cancelledlead_${orderId}`;
}

async function alreadyLoggedStuck(
  supabase: SupabaseClient,
  orderId: string,
  eventType: MetaEventLogType,
): Promise<boolean> {
  const { count } = await supabase
    .from("meta_event_log")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("event_type", eventType)
    .eq("state", "failed")
    .eq("reason", "stuck_timeout");
  return (count ?? 0) > 0;
}

export async function findStuckMetaEvents(
  supabase: SupabaseClient,
): Promise<StuckMetaEvent[]> {
  const stuck: StuckMetaEvent[] = [];
  const purchaseCutoff = minutesAgoIso(PURCHASE_STUCK_MINUTES);
  const cancelCutoff = minutesAgoIso(CANCEL_STUCK_MINUTES);
  const leadCutoff = minutesAgoIso(LEAD_STUCK_MINUTES);

  const { data: purchaseCandidates, error: purchaseErr } = await supabase
    .from("orders")
    .select("id, product_id, status, updated_at, meta_purchase_sent")
    .in("status", ["confirmed", "shipped"])
    .eq("meta_purchase_sent", false)
    .is("deleted_at", null);

  if (purchaseErr) throw new Error(purchaseErr.message);

  for (const order of purchaseCandidates ?? []) {
    const orderId = String(order.id);
    const eventType = mapDispatchEventTypeToLog("purchase");
    if (await alreadyLoggedStuck(supabase, orderId, eventType)) continue;

    const since = await resolveStatusSince(
      supabase,
      orderId,
      "confirmed",
      String(order.updated_at ?? ""),
    );
    if (since > purchaseCutoff) continue;

    stuck.push({
      orderId,
      productId: order.product_id ? String(order.product_id) : null,
      eventType,
      dispatchType: "purchase",
      eventId: purchaseEventId(orderId),
      reason: "stuck_timeout",
    });
  }

  const { data: cancelCandidates, error: cancelErr } = await supabase
    .from("orders")
    .select("id, product_id, status, updated_at, meta_cancel_sent")
    .eq("status", "cancelled")
    .eq("meta_cancel_sent", false)
    .is("deleted_at", null);

  if (cancelErr) throw new Error(cancelErr.message);

  for (const order of cancelCandidates ?? []) {
    const orderId = String(order.id);
    const eventType = mapDispatchEventTypeToLog("cancel");
    if (await alreadyLoggedStuck(supabase, orderId, eventType)) continue;

    const since = await resolveStatusSince(
      supabase,
      orderId,
      "cancelled",
      String(order.updated_at ?? ""),
    );
    if (since > cancelCutoff) continue;

    stuck.push({
      orderId,
      productId: order.product_id ? String(order.product_id) : null,
      eventType,
      dispatchType: "cancel",
      eventId: cancelEventId(orderId),
      reason: "stuck_timeout",
    });
  }

  const { data: leadCandidates, error: leadErr } = await supabase
    .from("orders")
    .select("id, product_id, created_at, meta_event_id, meta_lead_sent")
    .eq("status", "pending")
    .eq("meta_lead_sent", false)
    .not("meta_event_id", "is", null)
    .is("deleted_at", null)
    .lte("created_at", leadCutoff);

  if (leadErr) throw new Error(leadErr.message);

  for (const order of leadCandidates ?? []) {
    const orderId = String(order.id);
    const eventType = mapDispatchEventTypeToLog("lead");
    if (await alreadyLoggedStuck(supabase, orderId, eventType)) continue;

    const eventId = resolveLeadEventId({
      orderId,
      metaEventId: order.meta_event_id as string | null,
    });

    stuck.push({
      orderId,
      productId: order.product_id ? String(order.product_id) : null,
      eventType,
      dispatchType: "lead",
      eventId,
      reason: "stuck_timeout",
    });
  }

  return stuck;
}

export async function processStuckMetaEvents(supabase: SupabaseClient): Promise<{
  found: number;
  logged: number;
}> {
  const events = await findStuckMetaEvents(supabase);
  let logged = 0;

  for (const event of events) {
    await logMetaEventOutcome({
      supabase,
      eventType: event.eventType,
      eventId: event.eventId,
      orderId: event.orderId,
      productId: event.productId,
      state: "failed",
      reason: event.reason,
      detail: `stuck detected by scheduled check (${event.dispatchType})`,
    });
    logged += 1;
  }

  return { found: events.length, logged };
}

export async function countCurrentlyStuck(supabase: SupabaseClient): Promise<number> {
  const events = await findStuckMetaEvents(supabase);
  return events.length;
}

/**
 * Fast stuck-order count for the admin dashboard (3 indexed queries).
 *
 * `findStuckMetaEvents` walks every candidate with per-order history checks and
 * is correct for the scheduled stuck-event job, but it can exceed serverless
 * timeouts when the orders table is large — which aborts the RSC stream and
 * surfaces as "Connection closed" in the browser. This approximation is enough
 * for the monitoring overview card.
 */
export async function countStuckEventsFast(
  supabase: SupabaseClient,
): Promise<number> {
  const purchaseCutoff = minutesAgoIso(PURCHASE_STUCK_MINUTES);
  const cancelCutoff = minutesAgoIso(CANCEL_STUCK_MINUTES);
  const leadCutoff = minutesAgoIso(LEAD_STUCK_MINUTES);

  const [purchaseRes, cancelRes, leadRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "shipped"])
      .eq("meta_purchase_sent", false)
      .is("deleted_at", null)
      .lte("updated_at", purchaseCutoff),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled")
      .eq("meta_cancel_sent", false)
      .is("deleted_at", null)
      .lte("updated_at", cancelCutoff),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("meta_lead_sent", false)
      .not("meta_event_id", "is", null)
      .is("deleted_at", null)
      .lte("created_at", leadCutoff),
  ]);

  if (purchaseRes.error) throw new Error(purchaseRes.error.message);
  if (cancelRes.error) throw new Error(cancelRes.error.message);
  if (leadRes.error) throw new Error(leadRes.error.message);

  return (purchaseRes.count ?? 0) + (cancelRes.count ?? 0) + (leadRes.count ?? 0);
}
