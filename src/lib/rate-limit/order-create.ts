import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const ORDER_CREATE_RATE_LIMIT = {
  /** Max order-creation attempts per IP per minute. */
  perMinute: 10,
  /** Max order-creation attempts per IP per hour. */
  perHour: 30,
  minuteWindowSeconds: 60,
  hourWindowSeconds: 3600,
} as const;

export type OrderCreateRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

type UpstashRatelimitModule = typeof import("@upstash/ratelimit");

let minuteLimiter: InstanceType<UpstashRatelimitModule["Ratelimit"]> | null | undefined;
let hourLimiter: InstanceType<UpstashRatelimitModule["Ratelimit"]> | null | undefined;

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function getUpstashLimiters(): Promise<{
  minute: InstanceType<UpstashRatelimitModule["Ratelimit"]> | null;
  hour: InstanceType<UpstashRatelimitModule["Ratelimit"]> | null;
}> {
  if (!isUpstashConfigured()) {
    return { minute: null, hour: null };
  }

  if (minuteLimiter !== undefined && hourLimiter !== undefined) {
    return { minute: minuteLimiter, hour: hourLimiter };
  }

  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);

    const redis = Redis.fromEnv();
    minuteLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        ORDER_CREATE_RATE_LIMIT.perMinute,
        `${ORDER_CREATE_RATE_LIMIT.minuteWindowSeconds} s`,
      ),
      prefix: "order-create:minute",
    });
    hourLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        ORDER_CREATE_RATE_LIMIT.perHour,
        `${ORDER_CREATE_RATE_LIMIT.hourWindowSeconds} s`,
      ),
      prefix: "order-create:hour",
    });
  } catch (error) {
    console.error("[order-create-rate-limit] Upstash init failed; using DB fallback", error);
    minuteLimiter = null;
    hourLimiter = null;
  }

  return { minute: minuteLimiter ?? null, hour: hourLimiter ?? null };
}

function bucketKeyForIp(clientIp: string | null): string | null {
  const ip = clientIp?.trim();
  if (!ip) return null;
  return `order-create:ip:${ip}`;
}

async function checkDbRateLimit(
  supabase: SupabaseClient,
  bucketKey: string,
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_api_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[order-create-rate-limit] DB fallback RPC failed", error);
    return true;
  }

  return data === true;
}

/**
 * Enforces per-IP rate limits on public order creation.
 * Uses Upstash Redis when configured; otherwise falls back to Postgres counters.
 */
export async function checkOrderCreateRateLimit(
  supabase: SupabaseClient,
  clientIp: string | null,
): Promise<OrderCreateRateLimitResult> {
  const bucketKey = bucketKeyForIp(clientIp);
  if (!bucketKey) {
    return { allowed: true };
  }

  const { minute, hour } = await getUpstashLimiters();

  if (minute && hour) {
    const [minuteResult, hourResult] = await Promise.all([
      minute.limit(bucketKey),
      hour.limit(bucketKey),
    ]);

    if (!minuteResult.success) {
      return {
        allowed: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((minuteResult.reset - Date.now()) / 1000),
        ),
      };
    }

    if (!hourResult.success) {
      return {
        allowed: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((hourResult.reset - Date.now()) / 1000),
        ),
      };
    }

    return { allowed: true };
  }

  const minuteAllowed = await checkDbRateLimit(
    supabase,
    `${bucketKey}:minute`,
    ORDER_CREATE_RATE_LIMIT.perMinute,
    ORDER_CREATE_RATE_LIMIT.minuteWindowSeconds,
  );
  if (!minuteAllowed) {
    return { allowed: false, retryAfterSec: ORDER_CREATE_RATE_LIMIT.minuteWindowSeconds };
  }

  const hourAllowed = await checkDbRateLimit(
    supabase,
    `${bucketKey}:hour`,
    ORDER_CREATE_RATE_LIMIT.perHour,
    ORDER_CREATE_RATE_LIMIT.hourWindowSeconds,
  );
  if (!hourAllowed) {
    return { allowed: false, retryAfterSec: ORDER_CREATE_RATE_LIMIT.hourWindowSeconds };
  }

  return { allowed: true };
}
