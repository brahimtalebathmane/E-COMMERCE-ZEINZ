"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import {
  dispatchMetaLeadCapiWithRetry,
  finalizeMetaLeadDispatch,
  isMetaLeadCapiComplete,
  isMetaLeadDispatched,
  resolveMetaLeadPayload,
} from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
  /** Called only when Lead CAPI is sent/skipped (cookies may then be cleared). */
  onComplete?: () => void;
};

/**
 * Fires browser Lead and server Lead CAPI together on order-success load so Meta
 * receives both channels at the same moment (shared event_id for deduplication).
 */
export function OrderSuccessMetaLead({ orderId, onComplete }: Props) {
  const startedRef = useRef(false);

  useEffect(() => {
    const id = orderId.trim();
    if (!id || startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        if (isMetaLeadDispatched(id)) {
          onComplete?.();
          return;
        }

        const { payload, metaLeadSent } = await resolveMetaLeadPayload(id);
        if (metaLeadSent) {
          finalizeMetaLeadDispatch(id);
          onComplete?.();
          return;
        }

        if (!payload) {
          const capiResult = await dispatchMetaLeadCapiWithRetry({ orderId: id });
          if (isMetaLeadCapiComplete(capiResult)) {
            finalizeMetaLeadDispatch(id);
            onComplete?.();
          } else {
            console.warn("[Meta] Lead CAPI-only recovery on order-success failed", {
              orderId: id,
              capi: capiResult,
            });
          }
          return;
        }

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
          dispatchMetaLeadCapiWithRetry({ orderId: payload.orderId }),
        ]);

        if (isMetaLeadCapiComplete(capiResult)) {
          finalizeMetaLeadDispatch(id);
          onComplete?.();
          if (capiResult.state === "sent") {
            console.info("[Meta] Lead pixel + CAPI sent together on order-success", {
              orderId: payload.orderId,
              eventId: payload.eventId,
            });
          }
        } else {
          console.warn("[Meta] Lead CAPI failed on order-success (pixel may have fired)", {
            orderId: payload.orderId,
            capi: capiResult,
          });
        }
      } catch (error) {
        console.warn("[Meta] Lead dispatch failed on order-success", error);
      }
    })();
  }, [orderId, onComplete]);

  return null;
}
