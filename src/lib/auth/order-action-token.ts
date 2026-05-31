import { createHmac, timingSafeEqual } from "crypto";
import { normalizeEnv } from "@/lib/supabase/service";

function getOrderActionSecret(): string {
  const explicit = normalizeEnv(process.env.ORDER_ACTION_SECRET);
  if (explicit.length >= 16) {
    return explicit;
  }

  // Back-compat: Netlify may only have SUPABASE_SERVICE_ROLE_KEY set (pre–ORDER_ACTION_SECRET deploys).
  const serviceKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (serviceKey.length >= 16) {
    if (!explicit) {
      console.warn(
        "[order-action-token] ORDER_ACTION_SECRET unset — using SUPABASE_SERVICE_ROLE_KEY fallback. Set ORDER_ACTION_SECRET in Netlify for production.",
      );
    }
    return serviceKey;
  }

  throw new Error("ORDER_ACTION_SECRET is not configured or too short");
}

/** HMAC token bound to order id + completion_token (prevents order_id enumeration). */
export function signOrderActionToken(orderId: string, completionToken: string): string {
  const payload = `${orderId}:${completionToken}`;
  return createHmac("sha256", getOrderActionSecret()).update(payload).digest("base64url");
}

export function verifyOrderActionToken(
  orderId: string,
  completionToken: string,
  token: string,
): boolean {
  if (!token?.trim() || !orderId?.trim() || !completionToken?.trim()) {
    return false;
  }
  let expected: string;
  try {
    expected = signOrderActionToken(orderId.trim(), completionToken.trim());
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
