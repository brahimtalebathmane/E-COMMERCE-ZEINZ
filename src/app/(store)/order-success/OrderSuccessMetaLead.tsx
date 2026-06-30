"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import { consumeMetaPendingLead, dispatchMetaLeadCapi } from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
  completionToken: string | null;
  actionToken: string | null;
};

/**
 * Fires browser Lead and server Lead CAPI together on order-success load so Meta
 * receives both channels at the same moment (shared event_id for deduplication).
 */
export function OrderSuccessMetaLead({ orderId, completionToken, actionToken }: Props) {
  const startedRef = useRef(false);

  useEffect(() => {
    const id = orderId.trim();
    const ct = completionToken?.trim();
    const at = actionToken?.trim();
    if (!id || !ct || !at || startedRef.current) return;
    startedRef.current = true;

    const payload = consumeMetaPendingLead(id);
    if (!payload) return;

    void (async () => {
      try {
        const [, capiResult] = await Promise.all([
          trackLead({
            value: payload.value,
            currency: payload.currency,
            eventId: payload.eventId,
            orderId: payload.orderId,
            productId: payload.productId,
            productName: payload.productName,
            pixelId: payload.pixelId,
            phone: payload.phone,
            customerName: payload.customerName,
            quantity: payload.quantity,
          }),
          dispatchMetaLeadCapi({
            orderId: payload.orderId,
            completionToken: ct,
            actionToken: at,
          }),
        ]);

        if (capiResult.state !== "sent") {
          console.warn("[Meta] Lead CAPI on order-success", {
            orderId: payload.orderId,
            capi: capiResult,
          });
        } else {
          console.info("[Meta] Lead pixel + CAPI sent together on order-success", {
            orderId: payload.orderId,
            eventId: payload.eventId,
          });
        }
      } catch (error) {
        console.warn("[Meta] Lead dispatch failed on order-success", error);
      }
    })();
  }, [orderId, completionToken, actionToken]);

  return null;
}
