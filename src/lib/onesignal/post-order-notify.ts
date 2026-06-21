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
  return "Unknown Product";
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

  const productName = params.productName.trim() || "Unknown Product";
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
    headings: { en: "New Order Received" },
    contents: { en: `New Order Received for: ${productName}` },
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

    if (!res.ok) {
      const detail =
        typeof json.errors !== "undefined"
          ? JSON.stringify(json.errors).slice(0, 200)
          : res.statusText;
      return { sent: false, error: `${res.status}: ${detail}` };
    }

    // OneSignal returns 200 with no id / zero recipients when no device matches the admin tag.
    if (!json.id || json.recipients === 0) {
      const reason =
        typeof json.errors !== "undefined"
          ? `no_recipients: ${JSON.stringify(json.errors).slice(0, 160)}`
          : "no_recipients";
      return { sent: false, skipped: true, reason };
    }

    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sent: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
