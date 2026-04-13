import "server-only";
import crypto from "crypto";

type MetaUserDataInput = {
  name?: string | null;
  phone?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

type MetaCustomData = {
  value?: number;
  currency?: string;
  status?: string;
};

type SendMetaEventParams = {
  pixelId: string | null | undefined;
  eventName: "Lead" | "Purchase" | "CancelledLead";
  eventId: string;
  eventSourceUrl?: string | null;
  userData?: MetaUserDataInput;
  customData?: MetaCustomData;
};

function normalizeEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function normalizeHashInput(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(normalizeHashInput(value)).digest("hex");
}

function normalizePhoneForMeta(value: string): string | null {
  const digitsAndPlus = value.trim().replace(/[^\d+]/g, "");
  if (!digitsAndPlus) return null;
  const normalized = digitsAndPlus.startsWith("+")
    ? digitsAndPlus
    : `+${digitsAndPlus}`;
  return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
}

function splitNameParts(name: string): { firstName: string; lastName: string | null } {
  const normalized = name.trim().replace(/\s+/g, " ");
  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName,
    lastName: rest.length ? rest.join(" ") : null,
  };
}

function buildUserData(input?: MetaUserDataInput) {
  const data: Record<string, unknown> = {};
  if (!input) return data;

  if (input.clientIpAddress) data.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) data.client_user_agent = input.clientUserAgent;

  if (input.name?.trim()) {
    const { firstName, lastName } = splitNameParts(input.name);
    if (firstName) data.fn = [hash(firstName)];
    if (lastName) data.ln = [hash(lastName)];
  }

  if (input.phone?.trim()) {
    const normalizedPhone = normalizePhoneForMeta(input.phone);
    if (normalizedPhone) {
      data.ph = [hash(normalizedPhone)];
    }
  }

  return data;
}

export function getFirstForwardedIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return first ?? null;
}

export function createMetaEventId(): string {
  return `${Date.now()}_${crypto.randomUUID()}`;
}

async function safeMetaFetch(url: string, payload: unknown, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMetaEvent(params: SendMetaEventParams): Promise<boolean> {
  const accessToken = normalizeEnv(process.env.META_CAPI_ACCESS_TOKEN);
  const pixelId = params.pixelId?.trim();
  if (!accessToken || !pixelId) return false;

  const apiVersion = normalizeEnv(process.env.META_CAPI_VERSION) || "v22.0";
  const testEventCode = normalizeEnv(process.env.META_TEST_EVENT_CODE);
  const endpoint = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const eventTime = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: params.eventName,
        event_time: eventTime,
        event_id: params.eventId,
        action_source: "website",
        event_source_url: params.eventSourceUrl || undefined,
        user_data: buildUserData(params.userData),
        custom_data: params.customData || undefined,
      },
    ],
  };

  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await safeMetaFetch(endpoint, payload);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[meta] CAPI request failed", {
        eventName: params.eventName,
        status: res.status,
        body,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[meta] CAPI request error", {
      eventName: params.eventName,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
