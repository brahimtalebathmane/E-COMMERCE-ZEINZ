"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import {
  dispatchMetaLeadCapiWithRetry,
  finalizeMetaLeadDispatch,
  isMetaLeadCapiComplete,
  isMetaLeadDispatched,
  resolveMetaLeadPayload,
  shouldFallbackToBrowserLead,
} from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
  /** Called only when Lead dispatch settles (CAPI sent/skipped or browser fallback). */
  onComplete?: () => void;
};

/**
 * Server-first Lead: CAPI on order-success, browser pixel only when CAPI cannot ingest.
 * Firing both channels in parallel double-counts in live Events Manager even with a
 * shared event_id; Test Events mode hides CAPI from the live stream so it looked fine.
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

        const capiResult = await dispatchMetaLeadCapiWithRetry({
          orderId: payload?.orderId ?? id,
        });

        if (isMetaLeadCapiComplete(capiResult)) {
          finalizeMetaLeadDispatch(id);
          onComplete?.();
          if (capiResult.state === "sent") {
            console.info("[Meta] Lead CAPI sent on order-success", {
              orderId: payload?.orderId ?? id,
              eventId: payload?.eventId,
            });
          }
          return;
        }

        if (!payload || !shouldFallbackToBrowserLead(capiResult)) {
          console.warn("[Meta] Lead CAPI failed on order-success (no browser fallback)", {
            orderId: payload?.orderId ?? id,
            capi: capiResult,
          });
          return;
        }

        await trackLead({
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
        });

        finalizeMetaLeadDispatch(id);
        onComplete?.();
        console.info("[Meta] Lead browser fallback fired (CAPI unavailable)", {
          orderId: payload.orderId,
          eventId: payload.eventId,
          capi: capiResult,
        });
      } catch (error) {
        console.warn("[Meta] Lead dispatch failed on order-success", error);
      }
    })();
  }, [orderId, onComplete]);

  return null;
}
