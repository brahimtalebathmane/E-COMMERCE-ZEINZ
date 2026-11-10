import type { SupabaseClient } from "@supabase/supabase-js";
import { logMetaEventOutcomeFireAndForget } from "@/lib/meta/event-log";
import { isCtwaClickAttributable } from "@/lib/meta/ctwa-window";
import { buildMetaCustomerKey, sanitizePhoneForMetaE164 } from "@/lib/meta-user-data";
import { sendMetaEvent, type SendMetaEventResult } from "@/utils/meta";

/**
 * LeadSubmitted — "this conversation placed an order".
 *
 * Purchase is sent when an order becomes "confirmed", which in practice means
 * after the phone confirmation call. LeadSubmitted is sent when the WhatsApp
 * sale is RECORDED, whatever its initial status, so Ads Manager can show per ad
 * how many conversations placed an order and how many of those were lost on the
 * call. Measurement only: campaigns keep optimizing on Purchase, and nothing in
 * this file touches the Purchase event, its flags or its ledger.
 *
 * - Destination: the WhatsApp (WABA) dataset only, never the website pixel —
 *   same shape and token as the Purchase attribution leg (business_messaging,
 *   messaging_channel whatsapp, ctwa_clid + whatsapp_business_account_id).
 * - No value and no currency: nothing here can be read as revenue.
 * - At most one per click id. `meta_lead_submitted.ctwa_clid` is the primary
 *   key; Meta does not deduplicate business_messaging events, so that row is the
 *   only guarantee. A multi-line sale, a second order from the same click, two
 *   admins and a retry all race for it.
 * - `event_time` is when the order was recorded, not when the event is sent, so
 *   a LeadSubmitted sent late (click id found at confirm/cancel time, or a
 *   retry) still lands before the Purchase in Events Manager.
 * - Never throws to a caller through `sendLeadSubmittedSafely`; a failure is
 *   logged to meta_event_log (type lead_submitted), kept on the ledger row and
 *   retried from /admin/meta or on the order's next confirm/cancel.
 */

export const LEAD_SUBMITTED_EVENT_NAME = "LeadSubmitted" as const;

/** A claim older than this with no outcome is treated as abandoned (crashed function). */
export const LEAD_SUBMITTED_STALE_CLAIM_MS = 5 * 60 * 1000;

/** A failed attempt is not retried again before this. */
export const LEAD_SUBMITTED_RETRY_COOLDOWN_MS = 60 * 1000;

/**
 * Meta rejects a whole request whose event_time is more than 7 days old. A
 * little under that, so a request built just before the limit is not rejected
 * in flight.
 */
export const LEAD_SUBMITTED_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;

/**
 * A click captured slightly after the order (the WhatsApp worker and the admin
 * race) still belongs to that order's conversation. A click any later than this
 * after the order is a NEW conversation and must not be credited with it.
 */
const CLICK_AFTER_ORDER_TOLERANCE_MS = 30 * 60 * 1000;

export type LeadSubmittedResult =
  | { state: "sent"; eventId: string; ctwaClid: string }
  | { state: "skipped"; reason: LeadSubmittedSkipReason }
  | { state: "failed"; reason: string };

export type LeadSubmittedSkipReason =
  | "disabled"
  | "order_not_found"
  | "not_whatsapp_sale"
  | "not_local_operations"
  | "no_click_id"
  | "click_not_attributable"
  | "event_too_old"
  | "dataset_not_configured"
  | "already_sent"
  | "in_progress";

/**
 * `META_WHATSAPP_LEAD_SUBMITTED` — "on" (default) or "off". Only an explicit
 * "off" disables the event; unset or malformed means "on". Same style as
 * META_WHATSAPP_PIXEL_LEG, so it can be turned off in the host's environment
 * without a deploy of new code.
 */
export function isLeadSubmittedEnabled(): boolean {
  const raw = process.env.META_WHATSAPP_LEAD_SUBMITTED?.trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return raw !== "off";
}

function envValue(name: string): string | null {
  const raw = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  return raw || null;
}

/** Same destination rule as the Purchase attribution leg: both ids or nothing. */
function resolveDestination(): { datasetId: string; wabaId: string } | null {
  const datasetId = envValue("META_WHATSAPP_DATASET_ID");
  const wabaId = envValue("META_WHATSAPP_BUSINESS_ACCOUNT_ID");
  return datasetId && wabaId ? { datasetId, wabaId } : null;
}

export function leadSubmittedEventId(orderId: string): string {
  return `leadsubmitted_${orderId}`;
}

const ORDER_SELECT =
  "id, status, customer_name, phone, source, manual_sale_channel, manual_sale_group_id, meta_ctwa_clid, meta_fbp, meta_fbc, country_id, created_at, deleted_at";

type OrderRow = {
  id: string;
  status: string;
  customer_name: string | null;
  phone: string | null;
  source: string | null;
  manual_sale_channel: string | null;
  manual_sale_group_id: string | null;
  meta_ctwa_clid: string | null;
  meta_fbp: string | null;
  meta_fbc: string | null;
  country_id: string | null;
  created_at: string;
  deleted_at: string | null;
};

type LedgerRow = {
  ctwa_clid: string;
  order_id: string | null;
  event_id: string;
  state: "claimed" | "sent" | "failed";
  claim_token: string;
  claimed_at: string;
  attempt_count: number;
};

function formatError(
  result: { reason: string; detail?: string; errorSubcode?: number },
  now: Date = new Date(),
): string {
  const subcode = result.errorSubcode != null ? ` subcode=${result.errorSubcode}` : "";
  const detail = result.detail?.trim() ? ` ${result.detail.trim().slice(0, 300)}` : "";
  return `[${now.toISOString()}] ${result.reason}${subcode}${detail}`;
}

async function loadOrder(supabase: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrderRow | null) ?? null;
}

/**
 * The order a multi-line sale is represented by: its earliest live line. Every
 * line of the sale resolves to the same one, so the event id is stable whichever
 * line triggers it.
 */
async function resolveSaleLines(supabase: SupabaseClient, order: OrderRow): Promise<OrderRow[]> {
  if (!order.manual_sale_group_id) return [order];
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("manual_sale_group_id", order.manual_sale_group_id)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const lines = ((data as OrderRow[] | null) ?? []).slice();
  if (!lines.some((l) => l.id === order.id)) lines.push(order);
  lines.sort((x, y) =>
    x.created_at === y.created_at ? (x.id < y.id ? -1 : 1) : x.created_at < y.created_at ? -1 : 1,
  );
  return lines;
}

async function isLocalOperationsCountry(
  supabase: SupabaseClient,
  countryId: string | null,
): Promise<{ ok: boolean; isoCode: string | null }> {
  if (!countryId) return { ok: false, isoCode: null };
  const { data, error } = await supabase
    .from("countries")
    .select("iso_code, has_local_operations")
    .eq("id", countryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    ok: data?.has_local_operations === true,
    isoCode: (data?.iso_code as string | null) ?? null,
  };
}

/**
 * The click id for this sale and when it happened. The stored one first (set at
 * creation from the picked conversation); otherwise the conversation's current
 * click — the late case, where the WhatsApp worker captured the ad referral
 * after the admin recorded the sale. The click time comes from the click ledger
 * (first time that click id was seen), falling back to the contact row.
 */
async function resolveClick(
  supabase: SupabaseClient,
  lines: OrderRow[],
  forcedClid: string | null,
): Promise<{ ctwaClid: string; clickedAt: string | null } | null> {
  const stored =
    forcedClid?.trim() || (lines.map((l) => l.meta_ctwa_clid?.trim()).find(Boolean) ?? null);

  const normalized = sanitizePhoneForMetaE164(lines[0].phone ?? "");
  const { data: contact } = normalized
    ? await supabase
        .from("whatsapp_contacts")
        .select("last_ctwa_clid, last_ad_clicked_at")
        .eq("phone", normalized)
        .maybeSingle()
    : { data: null };
  const contactClid = (contact?.last_ctwa_clid as string | null)?.trim() || null;

  const ctwaClid = stored ?? contactClid;
  if (!ctwaClid) return null;

  const { data: click } = await supabase
    .from("whatsapp_ad_clicks")
    .select("clicked_at")
    .eq("ctwa_clid", ctwaClid)
    .maybeSingle();
  const clickedAt =
    (click?.clicked_at as string | null) ??
    (contactClid === ctwaClid ? ((contact?.last_ad_clicked_at as string | null) ?? null) : null);

  return { ctwaClid, clickedAt };
}

function isClickAttributableToOrder(clickedAt: string | null, orderCreatedMs: number): boolean {
  if (!clickedAt) return false;
  const clickedMs = Date.parse(clickedAt);
  if (!Number.isFinite(clickedMs)) return false;
  if (clickedMs > orderCreatedMs + CLICK_AFTER_ORDER_TOLERANCE_MS) return false;
  return isCtwaClickAttributable(clickedAt, orderCreatedMs);
}

type Claim =
  | { kind: "claimed"; token: string; eventId: string; orderId: string }
  | { kind: "skip"; reason: "already_sent" | "in_progress" };

/**
 * Takes the click's ledger row. A fresh click inserts it (primary key = once per
 * click). An existing row is taken over only when its last attempt failed or was
 * abandoned, and only by compare-and-set on the token read — two retries racing
 * cannot both win.
 */
async function claim(
  supabase: SupabaseClient,
  ctwaClid: string,
  anchor: OrderRow,
  now: Date,
): Promise<Claim> {
  const token = crypto.randomUUID();
  const eventId = leadSubmittedEventId(anchor.id);
  const { error } = await supabase.from("meta_lead_submitted").insert({
    ctwa_clid: ctwaClid,
    order_id: anchor.id,
    manual_sale_group_id: anchor.manual_sale_group_id,
    event_id: eventId,
    state: "claimed",
    claim_token: token,
    claimed_at: now.toISOString(),
    attempt_count: 1,
  });
  if (!error) return { kind: "claimed", token, eventId, orderId: anchor.id };
  if (error.code !== "23505") throw new Error(error.message);

  const { data: existing, error: readErr } = await supabase
    .from("meta_lead_submitted")
    .select("ctwa_clid, order_id, event_id, state, claim_token, claimed_at, attempt_count")
    .eq("ctwa_clid", ctwaClid)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  const row = existing as LedgerRow | null;
  if (!row) return { kind: "skip", reason: "in_progress" };
  if (row.state === "sent") return { kind: "skip", reason: "already_sent" };

  const age = now.getTime() - Date.parse(row.claimed_at);
  const abandoned = row.state === "claimed" && age > LEAD_SUBMITTED_STALE_CLAIM_MS;
  // A failure is retried, but not by the very next line of the same sale a
  // second later — that would only stack Meta round trips in front of Purchase.
  const retryable = row.state === "failed" && age > LEAD_SUBMITTED_RETRY_COOLDOWN_MS;
  if (!retryable && !abandoned) return { kind: "skip", reason: "in_progress" };

  const { data: taken, error: takeErr } = await supabase
    .from("meta_lead_submitted")
    .update({
      state: "claimed",
      claim_token: token,
      claimed_at: now.toISOString(),
      attempt_count: (row.attempt_count ?? 1) + 1,
      updated_at: now.toISOString(),
    })
    .eq("ctwa_clid", ctwaClid)
    .eq("claim_token", row.claim_token)
    .select("ctwa_clid")
    .maybeSingle();
  if (takeErr) throw new Error(takeErr.message);
  if (!taken) return { kind: "skip", reason: "in_progress" };
  return { kind: "claimed", token, eventId: row.event_id, orderId: row.order_id ?? anchor.id };
}

async function recordOutcome(
  supabase: SupabaseClient,
  ctwaClid: string,
  token: string,
  result: SendMetaEventResult,
): Promise<void> {
  const now = new Date();
  const patch = result.ok
    ? { state: "sent", sent_at: now.toISOString(), last_error: null, updated_at: now.toISOString() }
    : { state: "failed", last_error: formatError(result, now), updated_at: now.toISOString() };
  const { error } = await supabase
    .from("meta_lead_submitted")
    .update(patch)
    .eq("ctwa_clid", ctwaClid)
    .eq("claim_token", token);
  if (error) {
    console.error("[meta] LeadSubmitted: could not record the outcome", {
      ctwaClidPrefix: ctwaClid.slice(0, 8),
      accepted: result.ok,
      error: error.message,
    });
  }
}

/** The business_messaging payload. No custom_data: no value, no currency. */
export function buildLeadSubmittedParams(input: {
  order: Pick<OrderRow, "id" | "customer_name" | "phone" | "meta_fbp" | "meta_fbc">;
  eventId: string;
  eventTimeSec: number;
  ctwaClid: string;
  destination: { datasetId: string; wabaId: string };
  countryIsoCode: string | null;
}): Parameters<typeof sendMetaEvent>[0] {
  const { order } = input;
  return {
    pixelId: null,
    eventName: LEAD_SUBMITTED_EVENT_NAME,
    eventId: input.eventId,
    eventTimeSec: input.eventTimeSec,
    actionSource: "business_messaging",
    messagingChannel: "whatsapp",
    datasetId: input.destination.datasetId,
    accessTokenOverride: envValue("META_WHATSAPP_CAPI_ACCESS_TOKEN"),
    leg: "attribution",
    userData: {
      name: order.customer_name,
      phone: order.phone,
      fbp: order.meta_fbp?.trim() || null,
      fbc: order.meta_fbc?.trim() || null,
      clientIpAddress: null,
      clientUserAgent: null,
      externalId: buildMetaCustomerKey(order.phone) ?? order.id,
      country: input.countryIsoCode,
      ctwaClid: input.ctwaClid,
      whatsappBusinessAccountId: input.destination.wabaId,
    },
  };
}

function log(
  supabase: SupabaseClient,
  orderId: string,
  eventId: string,
  result: LeadSubmittedResult,
  detail?: string | null,
): void {
  logMetaEventOutcomeFireAndForget({
    supabase,
    eventType: "lead_submitted",
    eventId,
    orderId,
    state: result.state === "sent" ? "success" : result.state,
    reason: result.state === "sent" ? null : result.reason,
    detail,
    // A skip is informational; a failure pushes an admin alert like any other.
    notifyOnFailure: result.state === "failed",
  });
}

/**
 * Sends LeadSubmitted for the sale this order belongs to, if it is owed.
 * May throw on a database error — callers on a sale path use
 * `sendLeadSubmittedSafely`.
 */
export async function sendLeadSubmittedForOrder(
  supabase: SupabaseClient,
  orderId: string,
  options: {
    now?: Date;
    /** A retry passes the ledger row's click id: the conversation may have a newer click since. */
    ctwaClid?: string | null;
  } = {},
): Promise<LeadSubmittedResult> {
  const now = options.now ?? new Date();
  const order = await loadOrder(supabase, orderId);
  if (!order || order.deleted_at != null) return { state: "skipped", reason: "order_not_found" };
  if (order.source !== "manual" || order.manual_sale_channel !== "whatsapp") {
    return { state: "skipped", reason: "not_whatsapp_sale" };
  }
  const country = await isLocalOperationsCountry(supabase, order.country_id);
  if (!country.ok) return { state: "skipped", reason: "not_local_operations" };
  if (!isLeadSubmittedEnabled()) return { state: "skipped", reason: "disabled" };

  const lines = await resolveSaleLines(supabase, order);
  const anchor = lines[0];
  const eventId = leadSubmittedEventId(anchor.id);
  const createdMs = Date.parse(anchor.created_at);

  // Cheap exit: the common case on a confirm/cancel of a sale whose
  // LeadSubmitted already went out when it was recorded.
  const { data: sentForSale, error: sentErr } = await supabase
    .from("meta_lead_submitted")
    .select("state")
    .eq("order_id", anchor.id)
    .eq("state", "sent")
    .limit(1);
  if (sentErr) throw new Error(sentErr.message);
  if ((sentForSale ?? []).length > 0) return { state: "skipped", reason: "already_sent" };

  const click = await resolveClick(supabase, lines, options.ctwaClid ?? null);
  if (!click) return { state: "skipped", reason: "no_click_id" };
  if (!isClickAttributableToOrder(click.clickedAt, createdMs)) {
    return { state: "skipped", reason: "click_not_attributable" };
  }

  // Another order from the same click already sent it.
  const { data: existing, error: existingErr } = await supabase
    .from("meta_lead_submitted")
    .select("state")
    .eq("ctwa_clid", click.ctwaClid)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing?.state === "sent") return { state: "skipped", reason: "already_sent" };

  const destination = resolveDestination();
  if (!destination) {
    const result = { state: "skipped", reason: "dataset_not_configured" } as const;
    log(supabase, anchor.id, eventId, result);
    return result;
  }

  if (!Number.isFinite(createdMs) || now.getTime() - createdMs > LEAD_SUBMITTED_MAX_EVENT_AGE_MS) {
    const result = { state: "skipped", reason: "event_too_old" } as const;
    log(supabase, anchor.id, eventId, result);
    return result;
  }

  const claimed = await claim(supabase, click.ctwaClid, anchor, now);
  if (claimed.kind === "skip") return { state: "skipped", reason: claimed.reason };

  // A retry sends for the order the click was first claimed for.
  const target =
    claimed.orderId === anchor.id ? anchor : ((await loadOrder(supabase, claimed.orderId)) ?? anchor);
  const targetCreatedMs = Date.parse(target.created_at);
  const eventTimeSec = Math.floor(
    (Number.isFinite(targetCreatedMs) ? Math.min(targetCreatedMs, now.getTime()) : now.getTime()) / 1000,
  );

  let send: SendMetaEventResult;
  try {
    send = await sendMetaEvent(
      buildLeadSubmittedParams({
        order: target,
        eventId: claimed.eventId,
        eventTimeSec,
        ctwaClid: click.ctwaClid,
        destination,
        countryIsoCode: country.isoCode,
      }),
    );
  } catch (error) {
    send = {
      ok: false,
      reason: "network_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  await recordOutcome(supabase, click.ctwaClid, claimed.token, send);

  if (send.ok) {
    const result = { state: "sent", eventId: claimed.eventId, ctwaClid: click.ctwaClid } as const;
    log(supabase, target.id, claimed.eventId, result, send.detail);
    return result;
  }
  console.warn("[meta] LeadSubmitted rejected — the sale and its Purchase are unaffected", {
    orderId: target.id,
    reason: send.reason,
    errorSubcode: send.errorSubcode,
    detail: send.detail?.slice(0, 300),
  });
  const result = { state: "failed", reason: send.reason } as const;
  log(supabase, target.id, claimed.eventId, result, formatError(send));
  return result;
}

/**
 * The only entry point a sale path uses. Never throws, so a LeadSubmitted
 * problem can never fail or alter the sale or its Purchase.
 */
export async function sendLeadSubmittedSafely(
  supabase: SupabaseClient,
  orderId: string,
  options: { ctwaClid?: string | null } = {},
): Promise<LeadSubmittedResult> {
  try {
    return await sendLeadSubmittedForOrder(supabase, orderId, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[meta] LeadSubmitted failed — the sale and its Purchase are unaffected", {
      orderId,
      error: message,
    });
    logMetaEventOutcomeFireAndForget({
      supabase,
      eventType: "lead_submitted",
      eventId: leadSubmittedEventId(orderId),
      orderId,
      state: "failed",
      reason: "exception",
      detail: message,
    });
    return { state: "failed", reason: "exception" };
  }
}

/** Unsent ledger rows for /admin/meta: failed, or claimed and abandoned. */
export type LeadSubmittedBacklogRow = {
  ctwaClid: string;
  orderId: string | null;
  state: "claimed" | "failed";
  attemptCount: number;
  claimedAt: string;
  lastError: string | null;
};

export async function loadLeadSubmittedBacklog(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<LeadSubmittedBacklogRow[]> {
  const { data, error } = await supabase
    .from("meta_lead_submitted")
    .select("ctwa_clid, order_id, state, attempt_count, claimed_at, last_error")
    .neq("state", "sent")
    // Older than Meta's 7-day event_time limit: can no longer be sent at all.
    .gte("created_at", new Date(now.getTime() - LEAD_SUBMITTED_MAX_EVENT_AGE_MS).toISOString())
    .order("claimed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter(
      (r) =>
        r.state === "failed" ||
        now.getTime() - Date.parse(String(r.claimed_at)) > LEAD_SUBMITTED_STALE_CLAIM_MS,
    )
    .map((r) => ({
      ctwaClid: String(r.ctwa_clid),
      orderId: (r.order_id as string | null) ?? null,
      state: r.state as "claimed" | "failed",
      attemptCount: Number(r.attempt_count ?? 1),
      claimedAt: String(r.claimed_at),
      lastError: (r.last_error as string | null) ?? null,
    }));
}

export type LeadSubmittedRetryOutcome = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** Retries every unsent row once. Each goes through the same claim, so it is safe to press twice. */
export async function retryLeadSubmittedBacklog(
  supabase: SupabaseClient,
): Promise<LeadSubmittedRetryOutcome> {
  const backlog = await loadLeadSubmittedBacklog(supabase);
  const outcome: LeadSubmittedRetryOutcome = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of backlog) {
    if (!row.orderId) continue;
    outcome.attempted += 1;
    const result = await sendLeadSubmittedSafely(supabase, row.orderId, {
      ctwaClid: row.ctwaClid,
    });
    outcome[result.state === "sent" ? "sent" : result.state === "failed" ? "failed" : "skipped"] += 1;
  }
  return outcome;
}

export type LeadSubmittedSummary = {
  enabled: boolean;
  configured: boolean;
  sent7d: number;
  backlog: LeadSubmittedBacklogRow[];
};

/** What /admin/meta shows: is it on, how many went out, what is stuck and why. */
export async function loadLeadSubmittedSummary(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<LeadSubmittedSummary> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count, error }, backlog] = await Promise.all([
    supabase
      .from("meta_lead_submitted")
      .select("ctwa_clid", { count: "exact", head: true })
      .eq("state", "sent")
      .gte("sent_at", since),
    loadLeadSubmittedBacklog(supabase, now),
  ]);
  if (error) throw new Error(error.message);
  return {
    enabled: isLeadSubmittedEnabled(),
    configured: resolveDestination() != null,
    sent7d: count ?? 0,
    backlog,
  };
}
