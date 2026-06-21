import { normalizeEnv } from "@/lib/supabase/service";
import { getPublicSiteUrl } from "@/lib/site-url";
import { ONESIGNAL_APP_ID } from "@/lib/onesignal/constants";

// Kept under Netlify's ~10s synchronous-function budget so a slow/hung OneSignal call can
// never run long enough to get the whole POST /api/orders invocation killed before it
// returns the order response to the customer.
const ONESIGNAL_TIMEOUT_MS = 8_000;

// Broadcast to every active web-push subscription. This PWA is admin-only — installation
// and push opt-in happen exclusively inside /admin — so every subscription already belongs
// to an admin and a plain broadcast is correct and safe (no customer is ever subscribed).
//
// Default segment names differ across OneSignal app vintages: classic apps expose
// "Subscribed Users", newer apps default to "Total Subscriptions". Targeting a single name
// silently drops the push (segment-not-found) when the app uses the other. We try the known
// defaults in order and stop at the FIRST segment that actually delivers, so a missing
// segment name can never swallow the notification and a device is never double-notified.
const BROADCAST_SEGMENTS = ["Subscribed Users", "Total Subscriptions", "Active Users"] as const;

type OneSignalApiResponse = {
  id?: string;
  recipients?: number;
  errors?: unknown;
};

type OneSignalHttpResult =
  | { kind: "http"; status: number; ok: boolean; json: OneSignalApiResponse; rawBody: string }
  | { kind: "network"; error: string };

export type OneSignalNotifyResult =
  | { sent: true }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; error: string };

function resolveOneSignalRestApiKey(): string | null {
  const key = normalizeEnv(process.env.ONESIGNAL_REST_API_KEY);
  return key || null;
}

export function resolveOrderProductName(product: {
  name_ar?: string | null;
  name_fr?: string | null;
}): string {
  const nameAr = (product.name_ar ?? "").trim();
  if (nameAr) return nameAr;
  const nameFr = (product.name_fr ?? "").trim();
  if (nameFr) return nameFr;
  return "منتج غير معروف";
}

/** Single OneSignal REST call. Always returns a structured result — never throws. */
async function postOneSignalNotification(
  restApiKey: string,
  payload: Record<string, unknown>,
): Promise<OneSignalHttpResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ONESIGNAL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${restApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    // Read the raw body before JSON parsing so the COMPLETE OneSignal response — including
    // 400/403 error arrays and invalid-subscription diagnostics — is always available for
    // logging even when the body is empty or not valid JSON. Nothing is swallowed silently.
    const rawBody = await res.text();
    let json: OneSignalApiResponse = {};
    try {
      json = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      json = {};
    }
    return { kind: "http", status: res.status, ok: res.ok, json, rawBody };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      kind: "network",
      error: ac.signal.aborted ? `timeout_after_${ONESIGNAL_TIMEOUT_MS}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a push notification to every subscribed admin device for a new order. */
export async function notifyAdminsOfNewOrder(params: {
  orderId: string;
  productName: string;
}): Promise<OneSignalNotifyResult> {
  const restApiKey = resolveOneSignalRestApiKey();
  if (!restApiKey) {
    console.error(
      `[OneSignal] dispatch skipped for order ${params.orderId} — ONESIGNAL_REST_API_KEY is not set in the server environment (check Netlify/Railway env vars).`,
    );
    return { sent: false, skipped: true, reason: "onesignal_unconfigured" };
  }

  const productName = params.productName.trim() || "منتج غير معروف";
  const siteUrl = getPublicSiteUrl();
  const basePayload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    // Explicitly target the web/push channel so OneSignal never mis-routes to email/SMS.
    target_channel: "push",
    // OneSignal REST requires the English (`en`) key in `contents`; a payload with only `ar`
    // is rejected with HTTP 400 (this is why backend dispatch failed while client-side
    // activation worked). `en` is the mandatory default; `ar` is the displayed Arabic copy.
    headings: { en: "New order received", ar: "إشعار بطلب جديد" },
    contents: {
      en: `New order received for: ${productName}`,
      ar: `تم استلام طلب جديد لمنتج: ${productName}`,
    },
    data: { order_id: params.orderId },
  };
  if (siteUrl) {
    basePayload.url = `${siteUrl}/admin/orders`;
  }

  console.warn("[OneSignal] dispatch start", {
    order_id: params.orderId,
    app_id: ONESIGNAL_APP_ID,
    rest_key_present: true,
    site_url: siteUrl || null,
    candidate_segments: BROADCAST_SEGMENTS,
  });

  let lastReason = "no_recipients";
  let lastError: string | null = null;

  for (const segment of BROADCAST_SEGMENTS) {
    const payload = { ...basePayload, included_segments: [segment] };
    const result = await postOneSignalNotification(restApiKey, payload);

    if (result.kind === "network") {
      lastError = result.error;
      console.error(
        `[OneSignal] request error for order ${params.orderId} via segment "${segment}": ${result.error}`,
      );
      continue;
    }

    const { status, ok, json, rawBody } = result;
    // Full response logged at every attempt — status, id, recipients, errors, raw body.
    console.warn("[OneSignal] notifications response", {
      order_id: params.orderId,
      segment,
      http_status: status,
      notification_id: json.id ?? null,
      recipients: json.recipients ?? null,
      errors: typeof json.errors !== "undefined" ? json.errors : null,
      raw_response: rawBody.slice(0, 1000),
    });

    // Success: a segment delivered to at least one device. Stop immediately so no other
    // segment can re-send the same order notification (prevents duplicate pushes).
    if (ok && json.id && (json.recipients ?? 0) > 0) {
      console.warn(
        `[OneSignal] delivered order ${params.orderId} to ${json.recipients} recipient(s) via segment "${segment}" (notification ${json.id}).`,
      );
      return { sent: true };
    }

    if (!ok) {
      lastError = `${status}: ${
        typeof json.errors !== "undefined"
          ? JSON.stringify(json.errors).slice(0, 300)
          : rawBody.slice(0, 300) || "request_failed"
      }`;
      console.error(
        `[OneSignal] delivery failed (${status}) for order ${params.orderId} via segment "${segment}": ${lastError}`,
      );
      continue;
    }

    // HTTP 200 but zero recipients (segment valid but empty, or no match). Record and try
    // the next candidate segment.
    lastReason =
      typeof json.errors !== "undefined"
        ? `no_recipients: ${JSON.stringify(json.errors).slice(0, 160)}`
        : "no_recipients";
    console.warn(
      `[OneSignal] no recipients for order ${params.orderId} via segment "${segment}". Detail: ${lastReason}`,
    );
  }

  if (lastError) {
    console.error(
      `[OneSignal] all targeting attempts failed for order ${params.orderId}: ${lastError}`,
    );
    return { sent: false, error: lastError };
  }

  console.warn(
    `[OneSignal] no device subscribed for order ${params.orderId} across segments ${JSON.stringify(BROADCAST_SEGMENTS)}. Detail: ${lastReason}`,
  );
  return { sent: false, skipped: true, reason: lastReason };
}
