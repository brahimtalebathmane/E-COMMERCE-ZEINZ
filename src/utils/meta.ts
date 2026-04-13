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
  /** Used with `eventSourceUrl` to guarantee a non-empty absolute URL when stored URL is missing. */
  requestHeaders?: Headers | null;
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

/** First client IP from a comma-separated forwarded chain (or single value). */
export function getFirstForwardedIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first || null;
}

/**
 * Resolves client IP for CAPI: x-forwarded-for (first hop), then x-real-ip, then cf-connecting-ip.
 * Next.js Route Handlers do not expose `socket.remoteAddress`; rely on proxy headers.
 */
export function resolveClientIpAddress(h: Headers): string | null {
  const from = (name: string) => getFirstForwardedIp(h.get(name));
  return from("x-forwarded-for") ?? from("x-real-ip") ?? from("cf-connecting-ip") ?? null;
}

function trimUrl(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t || null;
}

function siteUrlFallback(): string {
  const site = normalizeEnv(process.env.NEXT_PUBLIC_SITE_URL);
  if (site) {
    const u = site.startsWith("http://") || site.startsWith("https://") ? site : `https://${site}`;
    return u.replace(/\/$/, "");
  }
  const vercel = normalizeEnv(process.env.VERCEL_URL);
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host.replace(/\/$/, "")}`;
  }
  return "https://localhost";
}

/** Always returns an absolute URL string for Meta `event_source_url`. */
export function resolveEventSourceUrl(input: {
  stored?: string | null;
  headers?: Headers | null;
}): string {
  const fromStored = trimUrl(input.stored ?? null);
  if (
    fromStored &&
    (fromStored.startsWith("http://") || fromStored.startsWith("https://"))
  ) {
    return fromStored;
  }
  const h = input.headers;
  if (h) {
    const referer = trimUrl(h.get("referer"));
    if (referer && (referer.startsWith("http://") || referer.startsWith("https://"))) {
      return referer;
    }
    const xUrl = trimUrl(h.get("x-url") ?? h.get("x-forwarded-url"));
    if (xUrl && (xUrl.startsWith("http://") || xUrl.startsWith("https://"))) {
      return xUrl;
    }
    const proto = trimUrl(h.get("x-forwarded-proto")) ?? "https";
    const hostRaw = trimUrl(h.get("x-forwarded-host") ?? h.get("host"));
    if (hostRaw) {
      const host = hostRaw.split(",")[0]?.trim() ?? hostRaw;
      const pathRaw = trimUrl(h.get("x-invoke-path") ?? h.get("x-original-uri")) ?? "/";
      const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;
      return `${proto}://${host}${path}`;
    }
  }
  return siteUrlFallback();
}

export function createMetaEventId(): string {
  return `${Date.now()}_${crypto.randomUUID()}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRetryableMetaHttpStatus(status: number): boolean {
  return status >= 500 || status === 429;
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

/**
 * Timeout-safe CAPI POST with up to 2 retries on transient failures.
 * `event_time` is locked on the first HTTP attempt (not before), then reused for retries only.
 */
export async function sendMetaEvent(params: SendMetaEventParams): Promise<boolean> {
  const accessToken = normalizeEnv(process.env.META_CAPI_ACCESS_TOKEN);
  const pixelId = params.pixelId?.trim();
  if (!accessToken || !pixelId) return false;

  const apiVersion = normalizeEnv(process.env.META_CAPI_VERSION) || "v22.0";
  const testEventCode = normalizeEnv(process.env.META_TEST_EVENT_CODE);
  const endpoint = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const resolvedSourceUrl = resolveEventSourceUrl({
    stored: params.eventSourceUrl,
    headers: params.requestHeaders ?? undefined,
  });

  const dataRowBase = {
    event_name: params.eventName,
    event_id: params.eventId,
    action_source: "website",
    event_source_url: resolvedSourceUrl,
    user_data: buildUserData(params.userData),
    custom_data: params.customData || undefined,
  };

  let lockedEventTimeSec: number | undefined;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(300 * attempt);
    }
    if (lockedEventTimeSec === undefined) {
      lockedEventTimeSec = Math.floor(Date.now() / 1000);
    }
    const payload: Record<string, unknown> = {
      data: [{ ...dataRowBase, event_time: lockedEventTimeSec }],
    };

    if (testEventCode) payload.test_event_code = testEventCode;

    try {
      const res = await safeMetaFetch(endpoint, payload);
      if (res.ok) return true;
      const body = await res.text().catch(() => "");
      const retryable = isRetryableMetaHttpStatus(res.status);
      console.error("[meta] CAPI request failed", {
        eventName: params.eventName,
        attempt: attempt + 1,
        status: res.status,
        body: body.slice(0, 500),
      });
      if (!retryable || attempt === maxAttempts - 1) return false;
    } catch (error) {
      console.error("[meta] CAPI request error", {
        eventName: params.eventName,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxAttempts - 1) return false;
    }
  }
  return false;
}
