/** Short-lived checkout session tokens — bridged from POST /api/orders into order-success. */

const ORDER_SUCCESS_CLIENT_SESSION_PREFIX = "order_success_client_session_v1:";

export type OrderSuccessClientSession = {
  completionToken: string;
  actionToken: string;
};

export function storeOrderSuccessClientSession(
  orderId: string,
  session: OrderSuccessClientSession,
): void {
  if (typeof window === "undefined") return;
  const id = orderId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      `${ORDER_SUCCESS_CLIENT_SESSION_PREFIX}${id}`,
      JSON.stringify(session),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readOrderSuccessClientSession(
  orderId: string,
): OrderSuccessClientSession | null {
  if (typeof window === "undefined") return null;
  const id = orderId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(`${ORDER_SUCCESS_CLIENT_SESSION_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderSuccessClientSession;
    if (!parsed.completionToken?.trim() || !parsed.actionToken?.trim()) return null;
    return {
      completionToken: parsed.completionToken.trim(),
      actionToken: parsed.actionToken.trim(),
    };
  } catch {
    return null;
  }
}

export function clearOrderSuccessClientSession(orderId: string): void {
  if (typeof window === "undefined") return;
  const id = orderId.trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(`${ORDER_SUCCESS_CLIENT_SESSION_PREFIX}${id}`);
  } catch {
    // ignore
  }
}

/** Props from RSC cookies first; fall back to sessionStorage from POST /api/orders. */
export function resolveOrderSuccessClientSession(
  orderId: string,
  props: { completionToken?: string | null; actionToken?: string | null },
): OrderSuccessClientSession | null {
  const completionToken = props.completionToken?.trim() || null;
  const actionToken = props.actionToken?.trim() || null;
  if (completionToken && actionToken) {
    return { completionToken, actionToken };
  }
  return readOrderSuccessClientSession(orderId);
}
