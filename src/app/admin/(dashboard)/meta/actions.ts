"use server";

import { headers } from "next/headers";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import {
  resolveClientIpAddress,
  sendMetaEvent,
  type MetaActionSource,
} from "@/utils/meta";

/**
 * Diagnostic: fires two Purchase events at Meta so an admin can see, without a
 * terminal, WHICH payload shape shows up in Events Manager -> Test Events.
 *
 * A WhatsApp sale has no browser session behind it - no user-agent, no IP, no
 * fbp/fbc - and is sent with action_source "chat". Meta answers such a request
 * with HTTP 200, events_received: 1 and a valid fbtrace_id, yet may still not
 * display it in Test Events, with no error at all. Sending both shapes side by
 * side turns "nothing appears" from a mystery into one observation: if only the
 * website-shaped one appears, the dataset and the test code are fine and the
 * test tool is simply blind to the other shape.
 *
 * The two events are told apart in Events Manager by their value: 1.11 for the
 * website shape, 2.22 for the chat shape.
 *
 * Nothing here touches orders, meta_event_log or any dispatch claim - it is a
 * pure outbound probe.
 */

const WEBSITE_SHAPE_VALUE = 1.11;
const CHAT_SHAPE_VALUE = 2.22;

/**
 * Meta rejects MRU on a Purchase event - error_subcode 2804011, "Invalid
 * Currency For Purchase Event" - even though MRU is valid ISO 4217. Real sales
 * already work around this: toMetaPixelPurchaseMoney() in src/lib/currency.ts
 * converts every MRU total to USD before it reaches the pixel. The probe sends
 * USD for the same reason, which also keeps it faithful to the real payload.
 */
const PROBE_CURRENCY = "USD";

export type MetaTestShapeResult = {
  shape: "website" | "chat";
  actionSource: MetaActionSource;
  value: number;
  sentUserAgent: boolean;
  sentIp: boolean;
  ok: boolean;
  detail: string;
};

export type SendMetaTestEventsResult =
  | {
      ok: true;
      pixelId: string;
      testEventCode: string;
      results: MetaTestShapeResult[];
    }
  | { ok: false; error: string };

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^['"]|['"]$/g, "");
}

export async function sendMetaTestEventsAction(): Promise<SendMetaTestEventsResult> {
  try {
    await assertPermission(PERMISSIONS.view_meta_monitoring);
  } catch {
    return { ok: false, error: "غير مصرح لك بهذا الإجراء." };
  }

  const testEventCode = readEnv("META_CAPI_TEST_EVENT_CODE");
  if (!testEventCode) {
    return {
      ok: false,
      error:
        "META_CAPI_TEST_EVENT_CODE غير مضبوط. لن نرسل شيئاً: بدونه تُحتسب أحداث الاختبار مبيعات حقيقية.",
    };
  }

  const pixelId = resolveServerMetaPixelId(null);
  if (!pixelId) {
    return { ok: false, error: "META_PIXEL_ID غير مضبوط على هذا الخادم." };
  }

  const requestHeaders = await headers();
  const clientIpAddress = resolveClientIpAddress(requestHeaders);
  const clientUserAgent = requestHeaders.get("user-agent")?.trim() || null;

  const stamp = Date.now();
  const externalId = `metatest_${stamp}`;

  const websiteResult = await sendMetaEvent({
    pixelId,
    eventName: "Purchase",
    eventId: `metatest_website_${stamp}`,
    requestHeaders,
    actionSource: "website",
    userData: { externalId, clientIpAddress, clientUserAgent },
    customData: { currency: PROBE_CURRENCY, value: WEBSITE_SHAPE_VALUE },
  });

  const chatResult = await sendMetaEvent({
    pixelId,
    eventName: "Purchase",
    eventId: `metatest_chat_${stamp}`,
    requestHeaders,
    actionSource: "chat",
    userData: { externalId },
    customData: { currency: PROBE_CURRENCY, value: CHAT_SHAPE_VALUE },
  });

  return {
    ok: true,
    pixelId,
    testEventCode,
    results: [
      {
        shape: "website",
        actionSource: "website",
        value: WEBSITE_SHAPE_VALUE,
        sentUserAgent: Boolean(clientUserAgent),
        sentIp: Boolean(clientIpAddress),
        ok: websiteResult.ok,
        detail: websiteResult.detail ?? (websiteResult.ok ? "" : websiteResult.reason),
      },
      {
        shape: "chat",
        actionSource: "chat",
        value: CHAT_SHAPE_VALUE,
        sentUserAgent: false,
        sentIp: false,
        ok: chatResult.ok,
        detail: chatResult.detail ?? (chatResult.ok ? "" : chatResult.reason),
      },
    ],
  };
}

/**
 * Creates — or retrieves, if it already exists — the Conversions API dataset
 * linked to the WhatsApp Business Account.
 *
 * Why this exists: a `business_messaging` Purchase cannot be sent to the website
 * pixel. Meta rejects it with error_subcode 2804132, "No WhatsApp Business
 * Account Linked to This Dataset", and says in the error itself to POST to
 * `/{waba-id}/dataset`. That endpoint is idempotent — it returns the existing
 * dataset id when there is one — so this is safe to press more than once.
 *
 * The token needs `whatsapp_business_management` and
 * `whatsapp_business_manage_events`, which a website-CAPI token usually lacks;
 * `META_WHATSAPP_CAPI_ACCESS_TOKEN` overrides `META_CAPI_ACCESS_TOKEN` for this
 * call. A permission failure is surfaced verbatim rather than summarised —
 * Meta's own message names the missing scope.
 */
export type ResolveWhatsAppDatasetResult =
  | { ok: true; datasetId: string; wabaId: string; alreadyConfigured: boolean }
  | { ok: false; error: string };

export async function resolveWhatsAppDatasetAction(): Promise<ResolveWhatsAppDatasetResult> {
  try {
    await assertPermission(PERMISSIONS.view_meta_monitoring);
  } catch {
    return { ok: false, error: "غير مصرح لك بهذا الإجراء." };
  }

  const wabaId = readEnv("META_WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (!wabaId) {
    return { ok: false, error: "META_WHATSAPP_BUSINESS_ACCOUNT_ID غير مضبوط." };
  }

  const token =
    readEnv("META_WHATSAPP_CAPI_ACCESS_TOKEN") || readEnv("META_CAPI_ACCESS_TOKEN");
  if (!token) {
    return { ok: false, error: "لا يوجد رمز وصول إلى Meta." };
  }

  const version = readEnv("META_CAPI_VERSION") || "v22.0";
  const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/dataset`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return { ok: false, error: `status=${res.status} ${body.slice(0, 600)}` };
    }

    // Meta has returned this id under both spellings across versions.
    const raw = parsed?.id ?? parsed?.dataset_id;
    const datasetId = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (!datasetId) {
      return { ok: false, error: `لم يُعِد Meta معرّف dataset: ${body.slice(0, 400)}` };
    }

    return {
      ok: true,
      datasetId,
      wabaId,
      alreadyConfigured: readEnv("META_WHATSAPP_DATASET_ID") === datasetId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
