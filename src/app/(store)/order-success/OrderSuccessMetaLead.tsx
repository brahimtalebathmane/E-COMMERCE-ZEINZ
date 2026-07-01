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
  /** Called when hybrid Lead dispatch settles (browser pixel queued + CAPI attempt finished). */
  onComplete?: () => void;
};

/**
 * Hybrid Lead on order-success: browser Pixel and CAPI fire in parallel with the same
 * `event_id` (`lead_{orderId}`) so Meta deduplicates them into one conversion.
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
          console.warn("[Meta] Lead dispatch skipped: missing payload", { orderId: id });
          return;
        }

        const [capiResult] = await Promise.all([
          dispatchMetaLeadCapiWithRetry({ orderId: payload.orderId }),
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
        ]);

        finalizeMetaLeadDispatch(id);
        onComplete?.();

        if (isMetaLeadCapiComplete(capiResult)) {
          console.info("[Meta] Lead hybrid dispatched (Pixel + CAPI)", {
            orderId: payload.orderId,
            eventId: payload.eventId,
            capi: capiResult.state,
          });
        } else {
          console.warn("[Meta] Lead Pixel fired; CAPI did not ingest", {
            orderId: payload.orderId,
            eventId: payload.eventId,
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
