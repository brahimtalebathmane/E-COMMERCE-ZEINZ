import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const META_CLIENT_FAILURE_RATE_LIMIT = {
  perMinute: 20,
  minuteWindowSeconds: 60,
} as const;

export type MetaClientFailureRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

type UpstashRatelimitModule = typeof import("@upstash/ratelimit");

let minuteLimiter: InstanceType<UpstashRatelimitModule["Ratelimit"]> | null | undefined;

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function getUpstashLimiter(): Promise<
  InstanceType<UpstashRatelimitModule["Ratelimit"]> | null
> {
  if (!isUpstashConfigured()) return null;
  if (minuteLimiter !== undefined) return minuteLimiter;

  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);
    minuteLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(
        META_CLIENT_FAILURE_RATE_LIMIT.perMinute,
        `${META_CLIENT_FAILURE_RATE_LIMIT.minuteWindowSeconds} s`,
      ),
      prefix: "meta-client-failure:minute",
    });
  } catch (error) {
    console.error("[meta-client-failure-rate-limit] Upstash init failed", error);
    minuteLimiter = null;
  }

  return minuteLimiter ?? null;
}

function bucketKeyForIp(clientIp: string | null): string | null {
  const ip = clientIp?.trim();
  if (!ip) return null;
  return `meta-client-failure:ip:${ip}`;
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
    console.error("[meta-client-failure-rate-limit] DB fallback RPC failed", error);
    return true;
  }
  return data === true;
}

export async function checkMetaClientFailureRateLimit(
  supabase: SupabaseClient,
  clientIp: string | null,
): Promise<MetaClientFailureRateLimitResult> {
  const bucketKey = bucketKeyForIp(clientIp);
  if (!bucketKey) return { allowed: true };

  const limiter = await getUpstashLimiter();
  if (limiter) {
    const result = await limiter.limit(bucketKey);
    if (!result.success) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    }
    return { allowed: true };
  }

  const allowed = await checkDbRateLimit(
    supabase,
    `${bucketKey}:minute`,
    META_CLIENT_FAILURE_RATE_LIMIT.perMinute,
    META_CLIENT_FAILURE_RATE_LIMIT.minuteWindowSeconds,
  );
  if (!allowed) {
    return {
      allowed: false,
      retryAfterSec: META_CLIENT_FAILURE_RATE_LIMIT.minuteWindowSeconds,
    };
  }
  return { allowed: true };
}
