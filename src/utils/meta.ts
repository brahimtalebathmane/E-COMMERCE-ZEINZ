import "server-only";
import crypto from "crypto";
import {
  META_PURCHASE_TRACKING_CURRENCY,
  META_PURCHASE_TRACKING_VALUE,
} from "@/lib/meta-purchase-tracking";

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

function isPlausibleClientIp(value: string): boolean {
  const t = value.trim();
  if (!t || t.toLowerCase() === "unknown") return false;
  if (/^[\d.]+$/.test(t)) {
    const parts = t.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n > 255)) return false;
    return true;
  }
  if (t.includes(":")) return t.length >= 3;
  return false;
}

function firstPlausibleIpFromHeader(headerValue: string | null): string | null {
  const first = getFirstForwardedIp(headerValue);
  if (!first || !isPlausibleClientIp(first)) return null;
  return first;
}

/**
 * Resolves client IP for CAPI: x-forwarded-for (first hop), then x-real-ip, then cf-connecting-ip.
 * Next.js Route Handlers do not expose `socket.remoteAddress`; rely on proxy headers only.
 */
export function resolveClientIpAddress(h: Headers): string | null {
  return (
    firstPlausibleIpFromHeader(h.get("x-forwarded-for")) ??
    firstPlausibleIpFromHeader(h.get("x-real-ip")) ??
    firstPlausibleIpFromHeader(h.get("cf-connecting-ip")) ??
    null
  );
}

function trimUrl(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t || null;
}

function isLocalOrInvalidHostname(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".localhost")
  );
}

function isAcceptableEventSourceUrl(raw: string | null | undefined): boolean {
  const t = trimUrl(raw ?? null);
  if (!t) return false;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isLocalOrInvalidHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function envBaseUrlCandidates(): string[] {
  const out: string[] = [];
  const site = normalizeEnv(process.env.NEXT_PUBLIC_SITE_URL);
  if (site) {
    const u = site.startsWith("http://") || site.startsWith("https://") ? site : `https://${site}`;
    out.push(u.replace(/\/$/, ""));
  }
  const vercel = normalizeEnv(process.env.VERCEL_URL);
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    out.push(`https://${host}`);
  }
  return out;
}

/**
 * Absolute production URL for CAPI fallback, or null if env would yield localhost / invalid.
 */
function resolveProductionBaseUrlFromEnv(): string | null {
  for (const candidate of envBaseUrlCandidates()) {
    if (isAcceptableEventSourceUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * Meta `event_source_url`: valid absolute https/http URL only, never localhost.
 * Returns null if nothing trustworthy is available (caller omits the field).
 */
export function resolveEventSourceUrl(input: {
  stored?: string | null;
  headers?: Headers | null;
}): string | null {
  const stored = trimUrl(input.stored ?? null);
  if (stored && isAcceptableEventSourceUrl(stored)) return stored;
  const h = input.headers;
  if (h) {
    const referer = trimUrl(h.get("referer"));
    if (referer && isAcceptableEventSourceUrl(referer)) return referer;
    const xUrl = trimUrl(h.get("x-url") ?? h.get("x-forwarded-url"));
    if (xUrl && isAcceptableEventSourceUrl(xUrl)) return xUrl;
    const proto = trimUrl(h.get("x-forwarded-proto")) ?? "https";
    const hostRaw = trimUrl(h.get("x-forwarded-host") ?? h.get("host"));
    if (hostRaw) {
      const host = hostRaw.split(",")[0]?.trim() ?? hostRaw;
      if (!isLocalOrInvalidHostname(host.split(":")[0] ?? host)) {
        const pathRaw = trimUrl(h.get("x-invoke-path") ?? h.get("x-original-uri")) ?? "/";
        const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;
        const built = `${proto}://${host}${path}`;
        if (isAcceptableEventSourceUrl(built)) return built;
      }
    }
  }
  return resolveProductionBaseUrlFromEnv();
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

/** Outcome of a Meta Conversions API (CAPI) request. */
export type SendMetaEventResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_access_token"
        | "missing_pixel_id"
        | "http_error"
        | "network_error"
        | "rejected";
    };

/**
 * Timeout-safe CAPI POST with up to 2 retries on transient failures.
 * `event_time` is locked on the first HTTP attempt (not before), then reused for retries only.
 */
export async function sendMetaEvent(params: SendMetaEventParams): Promise<SendMetaEventResult> {
  const accessToken = normalizeEnv(process.env.META_CAPI_ACCESS_TOKEN);
  const pixelId = params.pixelId?.trim();
  if (!accessToken) {
    console.warn("[meta] CAPI skipped: META_CAPI_ACCESS_TOKEN is not set", {
      eventName: params.eventName,
    });
    return { ok: false, reason: "missing_access_token" };
  }
  if (!pixelId) {
    console.warn("[meta] CAPI skipped: pixel id missing", { eventName: params.eventName });
    return { ok: false, reason: "missing_pixel_id" };
  }

  const apiVersion = normalizeEnv(process.env.META_CAPI_VERSION) || "v22.0";
  const testEventCode = normalizeEnv(process.env.META_TEST_EVENT_CODE);
  const endpoint = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const resolvedSourceUrl = resolveEventSourceUrl({
    stored: params.eventSourceUrl,
    headers: params.requestHeaders ?? undefined,
  });

  const customDataForCapi =
    params.eventName === "Purchase"
      ? {
          ...(params.customData ?? {}),
          value: META_PURCHASE_TRACKING_VALUE,
          currency: META_PURCHASE_TRACKING_CURRENCY,
        }
      : params.customData || undefined;

  const dataRowBase: Record<string, unknown> = {
    event_name: params.eventName,
    event_id: params.eventId,
    action_source: "website",
    user_data: buildUserData(params.userData),
    custom_data: customDataForCapi,
  };
  if (resolvedSourceUrl) {
    dataRowBase.event_source_url = resolvedSourceUrl;
  }

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
      const body = await res.text().catch(() => "");
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (res.ok) {
        const eventsReceivedRaw = parsed?.events_received;
        const eventsReceived =
          typeof eventsReceivedRaw === "number"
            ? eventsReceivedRaw
            : Number.isFinite(Number(eventsReceivedRaw))
              ? Number(eventsReceivedRaw)
              : 0;

        if (eventsReceived > 0) {
          console.info("[meta] CAPI event accepted", {
            eventName: params.eventName,
            eventIdPrefix: params.eventId?.slice(0, 12),
            eventsReceived,
            fbtrace_id:
              typeof parsed?.fbtrace_id === "string" ? parsed.fbtrace_id : undefined,
          });
          return { ok: true };
        }

        console.error("[meta] CAPI event rejected by Meta", {
          eventName: params.eventName,
          eventIdPrefix: params.eventId?.slice(0, 12),
          status: res.status,
          body: body.slice(0, 500),
        });
        return { ok: false, reason: "rejected" };
      }

      const retryable = isRetryableMetaHttpStatus(res.status);
      console.error("[meta] CAPI request failed", {
        eventName: params.eventName,
        attempt: attempt + 1,
        status: res.status,
        body: body.slice(0, 500),
      });
      if (!retryable || attempt === maxAttempts - 1) {
        return { ok: false, reason: "http_error" };
      }
    } catch (error) {
      console.error("[meta] CAPI request error", {
        eventName: params.eventName,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxAttempts - 1) {
        return { ok: false, reason: "network_error" };
      }
    }
  }
  return { ok: false, reason: "http_error" };
}
