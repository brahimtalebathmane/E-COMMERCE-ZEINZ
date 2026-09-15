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
    customData: { currency: "MRU", value: WEBSITE_SHAPE_VALUE },
  });

  const chatResult = await sendMetaEvent({
    pixelId,
    eventName: "Purchase",
    eventId: `metatest_chat_${stamp}`,
    requestHeaders,
    actionSource: "chat",
    userData: { externalId },
    customData: { currency: "MRU", value: CHAT_SHAPE_VALUE },
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
