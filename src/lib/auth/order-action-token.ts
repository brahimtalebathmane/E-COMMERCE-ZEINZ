import { createHmac, timingSafeEqual } from "crypto";

function getOrderActionSecret(): string {
  const secret = process.env.ORDER_ACTION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("ORDER_ACTION_SECRET is not configured or too short");
  }
  return secret;
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
