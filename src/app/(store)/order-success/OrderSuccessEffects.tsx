"use client";

import { useCallback, useRef } from "react";
import { OrderSuccessClient } from "./OrderSuccessClient";
import { OrderSuccessMetaLead } from "./OrderSuccessMetaLead";

type Props = {
  orderId: string | null;
  completionToken: string | null;
  actionToken: string | null;
  productId: string | null;
  productName: string | null;
  totalPrice: number | null;
  currency: string;
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
 * Runs Lead + WhatsApp post-checkout effects, then clears the short-lived
 * session cookies only after both have finished (Lead CAPI needs those cookies).
 */
export function OrderSuccessEffects({
  orderId,
  completionToken,
  actionToken,
  productId,
  productName,
  totalPrice,
  currency,
}: Props) {
  const leadDoneRef = useRef(!orderId);
  const waDoneRef = useRef(!orderId || !completionToken || !actionToken);
  const sessionClearedRef = useRef(false);

  const tryClearSession = useCallback(() => {
    if (sessionClearedRef.current) return;
    if (!leadDoneRef.current || !waDoneRef.current) return;
    sessionClearedRef.current = true;
    void clearOrderSuccessSession();
  }, []);

  const onLeadSettled = useCallback(() => {
    leadDoneRef.current = true;
    tryClearSession();
  }, [tryClearSession]);

  const onWhatsAppSettled = useCallback(() => {
    waDoneRef.current = true;
    tryClearSession();
  }, [tryClearSession]);

  return (
    <>
      {orderId ? <OrderSuccessMetaLead orderId={orderId} onSettled={onLeadSettled} /> : null}
      <OrderSuccessClient
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        productId={productId}
        productName={productName}
        totalPrice={totalPrice}
        currency={currency}
        onSettled={onWhatsAppSettled}
      />
    </>
  );
}
