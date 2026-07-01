"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import {
  clearMetaPendingLead,
  dispatchMetaLeadCapi,
  isMetaLeadDispatched,
  markMetaLeadDispatched,
  resolveMetaLeadPayload,
} from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
  onSettled?: () => void;
};

/**
 * Fires browser Lead and server Lead CAPI together on order-success load so Meta
 * receives both channels at the same moment (shared event_id for deduplication).
 */
export function OrderSuccessMetaLead({ orderId, onSettled }: Props) {
  const startedRef = useRef(false);

  useEffect(() => {
    const id = orderId.trim();
    if (!id || startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        if (isMetaLeadDispatched(id)) {
          return;
        }

        const { payload, metaLeadSent } = await resolveMetaLeadPayload(id);
        if (metaLeadSent) {
          markMetaLeadDispatched(id);
          clearMetaPendingLead();
          return;
        }
        if (!payload) {
          if (!metaLeadSent) {
            const capiResult = await dispatchMetaLeadCapi({ orderId: id });
            if (capiResult.state === "sent" || capiResult.state === "skipped") {
              markMetaLeadDispatched(id);
              clearMetaPendingLead();
            }
            if (capiResult.state !== "sent") {
              console.warn("[Meta] Lead CAPI-only recovery on order-success", {
                orderId: id,
                capi: capiResult,
              });
            }
          } else {
            console.warn("[Meta] Lead skipped on order-success: no payload", { orderId: id });
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
          dispatchMetaLeadCapi({
            orderId: payload.orderId,
          }),
        ]);

        markMetaLeadDispatched(id);
        clearMetaPendingLead();

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
      } finally {
        onSettled?.();
      }
    })();
  }, [orderId, onSettled]);

  return null;
}
