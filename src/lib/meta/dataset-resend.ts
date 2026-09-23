import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ORDER_DISPATCH_SELECT,
  prepareOrderEventPayload,
  recordAttributionLegOutcome,
  resolveWhatsAppDatasetDestination,
  sendAttributionLeg,
} from "@/lib/meta/dispatch";
import { logMetaEventOutcome } from "@/lib/meta/event-log";

/**
 * The WhatsApp dataset gap: WhatsApp sales whose Purchase reached the pixel but
 * not the dataset, even though they carry a click id.
 *
 * The dataset is the only source Meta's "Maximize number of purchases through
 * messaging" goal reads. A gap is therefore a conversion the optimiser never
 * learns from. This module makes it visible and resendable — it is NOT a
 * historical backfill: in steady state it finds nothing, and that emptiness is
 * the check that the feed is healthy.
 *
 * It only ever sends the attribution leg. These orders already produced a pixel
 * Purchase; a second one would be a duplicate sale inside the numbers the ad
 * sets read.
 */

/**
 * Meta rejects `event_time` older than 7 days for every non-`physical_store`
 * event. The half-day of slack keeps an order that is valid at selection time
 * from expiring before the request lands. Do not widen it, and never rewrite
 * `event_time` to "now" to slip an older order through — that is falsified
 * conversion data.
 */
export const DATASET_RESEND_WINDOW_MS = (6 * 24 + 12) * 60 * 60 * 1000;

/** How far back the gap is examined — also the range of the "unrecoverable" count. */
export const DATASET_GAP_LOOKBACK_DAYS = 30;

const RESEND_MAX_PER_RUN = 100;
const RESEND_DELAY_MS = 250;
/**
 * A run stops starting new sends after this long. The admin action runs in a
 * Netlify function with a hard timeout; stopping early and saying "run again"
 * beats being killed mid-request.
 */
const RESEND_TIME_BUDGET_MS = 6_000;
/** A claimed order whose run died mid-send becomes resendable again after this. */
const RESEND_LEASE_MS = 10 * 60 * 1000;
const CANDIDATE_ROW_CAP = 1000;
const IN_FILTER_CHUNK = 100;

export type PurchaseTimeSource = "event_log" | "confirmation" | "ordered_at";

export type DatasetGapOrder = {
  id: string;
  purchaseAt: string;
  purchaseTimeSource: PurchaseTimeSource;
};

export type DatasetGapSnapshot = {
  /** In the gap and still inside the resend window, oldest first. */
  eligible: DatasetGapOrder[];
  /** In the gap but past the window — permanently unrecoverable. */
  expiredCount: number;
  /** True when the candidate query hit its row cap. */
  truncated: boolean;
};

export type DatasetLastError = { orderId: string; message: string; updatedAt: string };

export type DatasetResendRunSummary = {
  at: string;
  state: "success" | "failed" | "skipped";
  detail: string | null;
};

/**
 * Orders in the gap, before the purchase-time check: attributable WhatsApp
 * sales that reached the pixel but not the dataset.
 */
function gapCandidatesQuery(supabase: SupabaseClient, sinceIso: string) {
  return supabase
    .from("orders")
    .select("id, ordered_at")
    .is("deleted_at", null)
    .eq("source", "manual")
    .eq("manual_sale_channel", "whatsapp")
    .eq("meta_purchase_sent", true)
    .eq("meta_purchase_dataset_sent", false)
    .not("meta_ctwa_clid", "is", null)
    .gte("ordered_at", sinceIso)
    .order("ordered_at", { ascending: true })
    .limit(CANDIDATE_ROW_CAP);
}

/**
 * The real moment of each purchase: the successful `purchase_{orderId}` log row,
 * otherwise the first transition to "confirmed", otherwise `ordered_at`.
 */
async function resolvePurchaseTimes(
  supabase: SupabaseClient,
  orders: { id: string; ordered_at: string }[],
): Promise<Map<string, { at: string; source: PurchaseTimeSource }>> {
  const times = new Map<string, { at: string; source: PurchaseTimeSource }>();
  if (orders.length === 0) return times;
  const logged = new Map<string, string>();
  const confirmed = new Map<string, string>();

  // Chunked: an `in (...)` list travels in the URL.
  for (let i = 0; i < orders.length; i += IN_FILTER_CHUNK) {
    const ids = orders.slice(i, i + IN_FILTER_CHUNK).map((o) => o.id);
    const [logRes, historyRes] = await Promise.all([
      supabase
        .from("meta_event_log")
        .select("event_id, created_at")
        .eq("event_type", "purchase")
        .eq("state", "success")
        .in(
          "event_id",
          ids.map((id) => `purchase_${id}`),
        )
        .order("created_at", { ascending: true }),
      supabase
        .from("order_status_history")
        .select("order_id, created_at")
        .eq("new_status", "confirmed")
        .in("order_id", ids)
        .order("created_at", { ascending: true }),
    ]);
    if (logRes.error) throw new Error(logRes.error.message);
    if (historyRes.error) throw new Error(historyRes.error.message);

    for (const row of (logRes.data ?? []) as { event_id: string; created_at: string }[]) {
      const orderId = row.event_id.slice("purchase_".length);
      if (!logged.has(orderId)) logged.set(orderId, row.created_at);
    }
    for (const row of (historyRes.data ?? []) as { order_id: string; created_at: string }[]) {
      if (!confirmed.has(row.order_id)) confirmed.set(row.order_id, row.created_at);
    }
  }

  for (const order of orders) {
    const fromLog = logged.get(order.id);
    const fromHistory = confirmed.get(order.id);
    if (fromLog) times.set(order.id, { at: fromLog, source: "event_log" });
    else if (fromHistory) times.set(order.id, { at: fromHistory, source: "confirmation" });
    else times.set(order.id, { at: order.ordered_at, source: "ordered_at" });
  }
  return times;
}

export async function loadDatasetGap(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<DatasetGapSnapshot> {
  const sinceIso = new Date(now - DATASET_GAP_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await gapCandidatesQuery(supabase, sinceIso);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as { id: string; ordered_at: string }[];

  const times = await resolvePurchaseTimes(supabase, candidates);
  const windowStart = now - DATASET_RESEND_WINDOW_MS;

  const eligible: DatasetGapOrder[] = [];
  let expiredCount = 0;
  for (const order of candidates) {
    const time = times.get(order.id);
    if (!time) continue;
    const atMs = Date.parse(time.at);
    if (Number.isFinite(atMs) && atMs >= windowStart) {
      eligible.push({ id: order.id, purchaseAt: time.at, purchaseTimeSource: time.source });
    } else {
      expiredCount += 1;
    }
  }
  eligible.sort((x, y) => Date.parse(x.purchaseAt) - Date.parse(y.purchaseAt));

  return { eligible, expiredCount, truncated: candidates.length >= CANDIDATE_ROW_CAP };
}

/** The most recent dataset-leg failure still standing, verbatim. */
export async function loadDatasetLastError(
  supabase: SupabaseClient,
): Promise<DatasetLastError | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, meta_dataset_last_error, updated_at")
    .is("deleted_at", null)
    .eq("meta_purchase_dataset_sent", false)
    .not("meta_dataset_last_error", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    orderId: data.id as string,
    message: data.meta_dataset_last_error as string,
    updatedAt: data.updated_at as string,
  };
}

export async function loadLastDatasetResendRun(
  supabase: SupabaseClient,
): Promise<DatasetResendRunSummary | null> {
  const { data, error } = await supabase
    .from("meta_event_log")
    .select("state, detail, created_at")
    .eq("event_type", "dataset_resend")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    at: data.created_at as string,
    state: data.state as DatasetResendRunSummary["state"],
    detail: (data.detail as string | null) ?? null,
  };
}

/** Real purchase time, held inside [now - window, now]. */
export function clampResendEventTimeSec(
  purchaseAt: string,
  now: number = Date.now(),
): number {
  const floor = now - DATASET_RESEND_WINDOW_MS;
  const parsed = Date.parse(purchaseAt);
  const ms = Number.isFinite(parsed) ? Math.min(Math.max(parsed, floor), now) : now;
  return Math.floor(ms / 1000);
}

/** 2804xxx is Meta's business_messaging family — the next order would hit the same wall. */
function isBusinessMessagingWall(subcode: number | undefined): boolean {
  return subcode != null && subcode >= 2804000 && subcode <= 2804999;
}

export type DatasetResendOutcome = {
  dryRun: boolean;
  eligible: number;
  expired: number;
  oldest: string | null;
  newest: string | null;
  attempted: number;
  accepted: number;
  rejected: number;
  /** Claimed by another run, no longer in the gap, or not sendable. */
  skipped: number;
  firstSubcode: number | null;
  firstError: string | null;
  stoppedReason: "business_messaging_rejection" | "time_budget" | "not_configured" | null;
  /** Eligible orders this run did not reach. */
  remaining: number;
};

type ResendOptions = {
  dryRun: boolean;
  now?: number;
  delayMs?: number;
  timeBudgetMs?: number;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Dry run: counts only. Real run: resends the attribution leg for at most 100
 * gap orders, sequentially, and never touches the pixel.
 */
export async function runDatasetResend(
  supabase: SupabaseClient,
  options: ResendOptions,
): Promise<DatasetResendOutcome> {
  const now = options.now ?? Date.now();
  const gap = await loadDatasetGap(supabase, now);
  const batch = gap.eligible.slice(0, RESEND_MAX_PER_RUN);

  const outcome: DatasetResendOutcome = {
    dryRun: options.dryRun,
    eligible: gap.eligible.length,
    expired: gap.expiredCount,
    oldest: gap.eligible[0]?.purchaseAt ?? null,
    newest: gap.eligible[gap.eligible.length - 1]?.purchaseAt ?? null,
    attempted: 0,
    accepted: 0,
    rejected: 0,
    skipped: 0,
    firstSubcode: null,
    firstError: null,
    stoppedReason: null,
    remaining: gap.eligible.length,
  };
  if (options.dryRun || batch.length === 0) return outcome;

  const destination = resolveWhatsAppDatasetDestination();
  if (!destination) {
    outcome.stoppedReason = "not_configured";
    return outcome;
  }

  const delayMs = options.delayMs ?? RESEND_DELAY_MS;
  const timeBudgetMs = options.timeBudgetMs ?? RESEND_TIME_BUDGET_MS;
  const startedAt = Date.now();

  for (const [index, gapOrder] of batch.entries()) {
    if (Date.now() - startedAt > timeBudgetMs) {
      outcome.stoppedReason = "time_budget";
      break;
    }
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    outcome.remaining -= 1;

    // Claim first. The filters restate the gap selection, so an order that
    // left the gap since it was listed — or that another run holds — is
    // skipped rather than sent twice.
    const leaseCutoff = new Date(Date.now() - RESEND_LEASE_MS).toISOString();
    const { data: order, error: claimError } = await supabase
      .from("orders")
      .update({ meta_dataset_resend_claimed_at: new Date().toISOString() })
      .eq("id", gapOrder.id)
      .is("deleted_at", null)
      .eq("meta_purchase_sent", true)
      .eq("meta_purchase_dataset_sent", false)
      .not("meta_ctwa_clid", "is", null)
      .or(`meta_dataset_resend_claimed_at.is.null,meta_dataset_resend_claimed_at.lt."${leaseCutoff}"`)
      .select(ORDER_DISPATCH_SELECT)
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!order) {
      outcome.skipped += 1;
      continue;
    }

    const releaseClaim = () =>
      supabase
        .from("orders")
        .update({ meta_dataset_resend_claimed_at: null })
        .eq("id", gapOrder.id);

    const ctwaClid = (order.meta_ctwa_clid as string | null)?.trim() || null;
    const prepared = ctwaClid
      ? await prepareOrderEventPayload(supabase, order, "purchase", `purchase_${gapOrder.id}`)
      : null;
    if (!ctwaClid || !prepared?.ok) {
      await releaseClaim();
      outcome.skipped += 1;
      continue;
    }

    const eventTimeSec = clampResendEventTimeSec(gapOrder.purchaseAt, Date.now());
    console.warn("[meta] dataset resend", {
      orderId: gapOrder.id,
      eventTime: new Date(eventTimeSec * 1000).toISOString(),
      eventTimeSource: gapOrder.purchaseTimeSource,
    });

    outcome.attempted += 1;
    const result = await sendAttributionLeg(
      order,
      prepared.payload,
      ctwaClid,
      destination,
      eventTimeSec,
    );
    await recordAttributionLegOutcome(supabase, gapOrder.id, result);

    if (result.ok) {
      outcome.accepted += 1;
      continue;
    }

    await releaseClaim();
    outcome.rejected += 1;
    if (outcome.firstError == null) {
      outcome.firstError = `${result.reason}${result.detail ? ` ${result.detail.slice(0, 300)}` : ""}`;
      outcome.firstSubcode = result.errorSubcode ?? null;
    }
    if (isBusinessMessagingWall(result.errorSubcode)) {
      outcome.stoppedReason = "business_messaging_rejection";
      break;
    }
  }

  await logMetaEventOutcome({
    supabase,
    eventType: "dataset_resend",
    eventId: `dataset_resend_${now}`,
    state: outcome.rejected > 0 ? "failed" : "success",
    reason: outcome.stoppedReason,
    detail: JSON.stringify({
      accepted: outcome.accepted,
      rejected: outcome.rejected,
      skipped: outcome.skipped,
      firstSubcode: outcome.firstSubcode,
      remaining: outcome.remaining,
    }),
  });

  return outcome;
}
