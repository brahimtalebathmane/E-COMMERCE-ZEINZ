import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOrderActionToken } from "@/lib/auth/order-action-token";

/** HttpOnly cookie names for post-checkout order actions (never expose in URLs). */
export const ORDER_SUCCESS_OID_COOKIE = "order_success_oid";
export const ORDER_SUCCESS_CT_COOKIE = "order_success_ct";
export const ORDER_SUCCESS_AT_COOKIE = "order_success_at";

/** Short-lived session window for order-success page actions. */
export const ORDER_SUCCESS_COOKIE_MAX_AGE_SEC = 600;

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export type OrderSuccessSessionTokens = {
  orderId: string;
  completionToken: string;
  actionToken: string;
};

export function setOrderSuccessSessionCookies(
  response: NextResponse,
  tokens: OrderSuccessSessionTokens,
): void {
  const opts = { ...cookieBase(), maxAge: ORDER_SUCCESS_COOKIE_MAX_AGE_SEC };
  response.cookies.set(ORDER_SUCCESS_OID_COOKIE, tokens.orderId, opts);
  response.cookies.set(ORDER_SUCCESS_CT_COOKIE, tokens.completionToken, opts);
  response.cookies.set(ORDER_SUCCESS_AT_COOKIE, tokens.actionToken, opts);
}

export function clearOrderSuccessSessionCookies(response: NextResponse): void {
  const opts = { ...cookieBase(), maxAge: 0 };
  response.cookies.set(ORDER_SUCCESS_OID_COOKIE, "", opts);
  response.cookies.set(ORDER_SUCCESS_CT_COOKIE, "", opts);
  response.cookies.set(ORDER_SUCCESS_AT_COOKIE, "", opts);
}

/** Validates the HttpOnly post-checkout session for a given order id. */
export async function readVerifiedOrderSuccessSession(
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const id = orderId.trim();
  if (!id) return { ok: false, reason: "missing_order_id" };

  const cookieStore = await cookies();
  const cookieOrderId = cookieStore.get(ORDER_SUCCESS_OID_COOKIE)?.value?.trim() || null;
  const completionToken = cookieStore.get(ORDER_SUCCESS_CT_COOKIE)?.value?.trim() || null;
  const actionToken = cookieStore.get(ORDER_SUCCESS_AT_COOKIE)?.value?.trim() || null;

  if (!cookieOrderId || cookieOrderId !== id) {
    return { ok: false, reason: "session_order_mismatch" };
  }
  if (!completionToken || !actionToken) {
    return { ok: false, reason: "session_tokens_missing" };
  }
  if (!verifyOrderActionToken(id, completionToken, actionToken)) {
    return { ok: false, reason: "invalid_action_token" };
  }
  return { ok: true };
}
