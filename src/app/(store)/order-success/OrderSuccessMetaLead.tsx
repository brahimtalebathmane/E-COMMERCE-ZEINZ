"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import { consumeMetaPendingLead } from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
};

/**
 * Fires browser Lead after navigation to order-success so fbq is not cancelled
 * by the modal → router.push transition.
 */
export function OrderSuccessMetaLead({ orderId }: Props) {
  const startedRef = useRef(false);

  useEffect(() => {
    const id = orderId.trim();
    if (!id || startedRef.current) return;
    startedRef.current = true;

    const payload = consumeMetaPendingLead(id);
    if (!payload) return;

    void (async () => {
      try {
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

        if (payload.capiConfigured && !payload.capiLeadSent) {
          console.warn("[Meta] Browser Lead sent on order-success — CAPI did not confirm Lead", {
            orderId: payload.orderId,
            capiState: payload.capiState,
            reason: payload.capiReason,
          });
        }
      } catch (error) {
        console.warn("[Meta] Browser Lead failed on order-success", error);
      }
    })();
  }, [orderId]);

  return null;
}
