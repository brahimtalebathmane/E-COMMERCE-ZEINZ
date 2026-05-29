import { NextResponse } from "next/server";
import { assertAdminUser, AuthError } from "@/lib/auth/admin";
import { verifyOrderActionToken } from "@/lib/auth/order-action-token";
import { FORBIDDEN_RESPONSE } from "@/lib/api/errors";

export type OrderActionCredentials = {
  order_id: string;
  completion_token: string;
  action_token: string;
};

export async function requireAdminApi(): Promise<
  { ok: true; session: Awaited<ReturnType<typeof assertAdminUser>> } | { ok: false; response: NextResponse }
> {
  try {
    const session = await assertAdminUser();
    return { ok: true, session };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: false, response: FORBIDDEN_RESPONSE };
  }
}

/** Customer post-checkout flows: valid HMAC action token for this order. */
export function requireOrderActionToken(credentials: OrderActionCredentials): boolean {
  return verifyOrderActionToken(
    credentials.order_id,
    credentials.completion_token,
    credentials.action_token,
  );
}

/**
 * Admin session OR valid order action token (HMAC).
 * Returns 403 Forbidden when neither is satisfied.
 */
export async function requireAdminOrOrderAction(
  credentials: Partial<OrderActionCredentials>,
): Promise<{ ok: true; via: "admin" | "order_token" } | { ok: false; response: NextResponse }> {
  const admin = await requireAdminApi();
  if (admin.ok) {
    return { ok: true, via: "admin" };
  }

  const orderId = credentials.order_id?.trim();
  const completionToken = credentials.completion_token?.trim();
  const actionToken = credentials.action_token?.trim();
  if (!orderId || !completionToken || !actionToken) {
    return { ok: false, response: FORBIDDEN_RESPONSE };
  }
  if (!requireOrderActionToken({ order_id: orderId, completion_token: completionToken, action_token: actionToken })) {
    return { ok: false, response: FORBIDDEN_RESPONSE };
  }
  return { ok: true, via: "order_token" };
}
