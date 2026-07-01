import { verifyOrderActionToken } from "@/lib/auth/order-action-token";
import { readVerifiedOrderSuccessSession } from "@/lib/orders/order-success-session";

export type ShopperOrderSuccessCredentials = {
  orderId: string;
  completionToken?: string | null;
  actionToken?: string | null;
};

/**
 * Shopper post-checkout auth for order-success APIs.
 * Prefers HMAC body tokens (same as WhatsApp); falls back to HttpOnly session cookies.
 */
export async function verifyShopperOrderSuccessAccess(
  credentials: ShopperOrderSuccessCredentials,
): Promise<{ ok: true; via: "body_token" | "cookie" } | { ok: false; reason: string }> {
  const orderId = credentials.orderId.trim();
  if (!orderId) return { ok: false, reason: "missing_order_id" };

  const completionToken = credentials.completionToken?.trim() || null;
  const actionToken = credentials.actionToken?.trim() || null;

  if (completionToken && actionToken) {
    if (verifyOrderActionToken(orderId, completionToken, actionToken)) {
      return { ok: true, via: "body_token" };
    }
    return { ok: false, reason: "invalid_action_token" };
  }

  const session = await readVerifiedOrderSuccessSession(orderId);
  if (session.ok) {
    return { ok: true, via: "cookie" };
  }
  return { ok: false, reason: session.reason };
}
