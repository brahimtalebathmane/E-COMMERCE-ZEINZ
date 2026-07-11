import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyAdminsOfMetaFailure } from "@/lib/onesignal/post-order-notify";

export type MetaEventLogType =
  | "view_content"
  | "initiate_checkout"
  | "lead"
  | "purchase"
  | "cancelled_lead"
  | "config_health"
  | "emq_check"
  | "pixel_load_failure";

export type MetaEventLogState = "success" | "failed" | "skipped";

export type MetaDispatchEventType = "lead" | "purchase" | "cancel";

const PUSH_DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000;

export function mapDispatchEventTypeToLog(
  eventType: MetaDispatchEventType,
): MetaEventLogType {
  if (eventType === "cancel") return "cancelled_lead";
  return eventType;
}

function truncateDetail(value: string | null | undefined, max = 500): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

export type LogMetaEventInput = {
  supabase?: SupabaseClient;
  eventType: MetaEventLogType;
  eventId: string;
  state: MetaEventLogState;
  orderId?: string | null;
  productId?: string | null;
  reason?: string | null;
  detail?: string | null;
  attemptCount?: number;
  /** When false, skips push even on failed (e.g. rate-based alerts handled elsewhere). */
  notifyOnFailure?: boolean;
};

/** True when no prior failed row exists in the dedup window — safe to push-notify. */
async function shouldSendFailurePush(
  supabase: SupabaseClient,
  input: Pick<LogMetaEventInput, "eventType" | "eventId" | "orderId">,
): Promise<boolean> {
  const since = new Date(Date.now() - PUSH_DEDUP_WINDOW_MS).toISOString();
  let query = supabase
    .from("meta_event_log")
    .select("id", { count: "exact", head: true })
    .eq("event_type", input.eventType)
    .eq("state", "failed")
    .gte("created_at", since);

  if (input.orderId) {
    query = query.eq("order_id", input.orderId);
  } else {
    query = query.eq("event_id", input.eventId);
  }

  const { count, error } = await query;
  if (error) {
    console.warn("[meta-event-log] dedup check failed", { message: error.message });
    return true;
  }
  return (count ?? 0) === 0;
}

/**
 * Persists a Meta observability row and optionally notifies admins on final failures.
 * Fire-and-forget safe — never throws to callers.
 */
export async function logMetaEventOutcome(input: LogMetaEventInput): Promise<void> {
  const eventId = input.eventId.trim();
  if (!eventId) return;

  try {
    const supabase = input.supabase ?? createServiceClient();
    const row = {
      event_type: input.eventType,
      order_id: input.orderId ?? null,
      product_id: input.productId ?? null,
      event_id: eventId,
      state: input.state,
      reason: input.reason?.trim() || null,
      detail: truncateDetail(input.detail),
      attempt_count: input.attemptCount ?? 1,
    };

    const shouldNotify =
      input.state === "failed" &&
      input.notifyOnFailure !== false &&
      (await shouldSendFailurePush(supabase, {
        eventType: input.eventType,
        eventId,
        orderId: input.orderId,
      }));

    const { error } = await supabase.from("meta_event_log").insert(row);
    if (error) {
      console.error("[meta-event-log] insert failed", {
        eventType: input.eventType,
        state: input.state,
        message: error.message,
      });
      return;
    }

    if (!shouldNotify) {
      return;
    }

    void notifyAdminsOfMetaFailure({
      eventType: input.eventType,
      orderId: input.orderId ?? undefined,
      productId: input.productId ?? undefined,
      reason: input.reason ?? "unknown",
      eventId,
    }).catch((err) => {
      console.error("[meta-event-log] push notify failed", err);
    });
  } catch (err) {
    console.error("[meta-event-log] unexpected error", err);
  }
}

/** Non-blocking wrapper for dispatch layers. */
export function logMetaEventOutcomeFireAndForget(input: LogMetaEventInput): void {
  void logMetaEventOutcome(input);
}
