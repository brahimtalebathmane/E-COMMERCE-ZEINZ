"use client";

import { useCallback, useRef } from "react";
import { OrderSuccessClient } from "./OrderSuccessClient";
import { OrderSuccessMetaLead } from "./OrderSuccessMetaLead";

type Props = {
  orderId: string | null;
  completionToken: string | null;
  actionToken: string | null;
};

async function clearOrderSuccessSession(): Promise<void> {
  try {
    await fetch("/api/orders/session/clear", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch (e) {
    console.warn("[order-success] Failed to clear session cookies", e);
  }
}

/**
 * Runs hybrid Lead (Pixel + CAPI) + WhatsApp post-checkout effects, then clears the
 * short-lived session cookies only after both have finished (Lead CAPI needs those cookies).
 *
 * Only needs orderId + the two session tokens (all synchronous from cookies/query params) —
 * never waits on the product/order DB lookup that resolves the rest of the page's content.
 */
export function OrderSuccessEffects({ orderId, completionToken, actionToken }: Props) {
  const leadDoneRef = useRef(!orderId);
  const waDoneRef = useRef(!orderId || !completionToken || !actionToken);
  const sessionClearedRef = useRef(false);

  const tryClearSession = useCallback(() => {
    if (sessionClearedRef.current) return;
    if (!leadDoneRef.current || !waDoneRef.current) return;
    sessionClearedRef.current = true;
    void clearOrderSuccessSession();
  }, []);

  const onLeadComplete = useCallback(() => {
    leadDoneRef.current = true;
    tryClearSession();
  }, [tryClearSession]);

  const onWhatsAppSettled = useCallback(() => {
    waDoneRef.current = true;
    tryClearSession();
  }, [tryClearSession]);

  return (
    <>
      {orderId ? (
        <OrderSuccessMetaLead
          orderId={orderId}
          completionToken={completionToken}
          actionToken={actionToken}
          onComplete={onLeadComplete}
        />
      ) : null}
      <OrderSuccessClient
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        onSettled={onWhatsAppSettled}
      />
    </>
  );
}
