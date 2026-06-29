import { NextResponse } from "next/server";

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
