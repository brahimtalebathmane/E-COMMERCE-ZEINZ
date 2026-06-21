import { normalizeEnv } from "@/lib/supabase/service";
import { getPublicSiteUrl } from "@/lib/site-url";
import {
  ONESIGNAL_ADMIN_TAG_KEY,
  ONESIGNAL_ADMIN_TAG_VALUE,
  ONESIGNAL_APP_ID,
} from "@/lib/onesignal/constants";

const ONESIGNAL_TIMEOUT_MS = 15_000;

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

/** Sends a push notification to admin subscribers tagged in the dashboard. */
export async function notifyAdminsOfNewOrder(params: {
  orderId: string;
  productName: string;
}): Promise<OneSignalNotifyResult> {
  const restApiKey = resolveOneSignalRestApiKey();
  if (!restApiKey) {
    return { sent: false, skipped: true, reason: "onesignal_unconfigured" };
  }

  const productName = params.productName.trim() || "منتج غير معروف";
  const siteUrl = getPublicSiteUrl();
  const payload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    filters: [
      {
        field: "tag",
        key: ONESIGNAL_ADMIN_TAG_KEY,
        relation: "=",
        value: ONESIGNAL_ADMIN_TAG_VALUE,
      },
    ],
    headings: { ar: "إشعار بطلب جديد" },
    contents: { ar: `تم استلام طلب جديد لمنتج: ${productName}` },
    data: { order_id: params.orderId },
  };
  if (siteUrl) {
    payload.url = `${siteUrl}/admin/orders`;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ONESIGNAL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${restApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      recipients?: number;
      errors?: unknown;
    };

    // Surface the raw OneSignal REST response natively in the backend console so silent
    // failures, dropped pushes, and "invalid/unsubscribed token" diagnostics are visible.
    // console.warn/error survive Next's production console stripping (console.log does not).
    console.warn("[OneSignal] notifications response", {
      order_id: params.orderId,
      http_status: res.status,
      notification_id: json.id ?? null,
      recipients: json.recipients ?? null,
      errors: typeof json.errors !== "undefined" ? json.errors : null,
    });

    if (!res.ok) {
      const detail =
        typeof json.errors !== "undefined"
          ? JSON.stringify(json.errors).slice(0, 200)
          : res.statusText;
      console.error(
        `[OneSignal] delivery failed (${res.status}) for order ${params.orderId}: ${detail}`,
      );
      return { sent: false, error: `${res.status}: ${detail}` };
    }

    // OneSignal returns 200 with no id / zero recipients when no device matches the admin tag.
    if (!json.id || json.recipients === 0) {
      const reason =
        typeof json.errors !== "undefined"
          ? `no_recipients: ${JSON.stringify(json.errors).slice(0, 160)}`
          : "no_recipients";
      console.warn(
        `[OneSignal] no recipients for order ${params.orderId} — no device is currently subscribed under tag ${ONESIGNAL_ADMIN_TAG_KEY}=${ONESIGNAL_ADMIN_TAG_VALUE}. Detail: ${reason}`,
      );
      return { sent: false, skipped: true, reason };
    }

    console.warn(
      `[OneSignal] delivered order ${params.orderId} to ${json.recipients} recipient(s) (notification ${json.id}).`,
    );
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = ac.signal.aborted ? `timeout_after_${ONESIGNAL_TIMEOUT_MS}ms` : msg;
    console.error(
      `[OneSignal] request error for order ${params.orderId}: ${reason}`,
    );
    return { sent: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}
