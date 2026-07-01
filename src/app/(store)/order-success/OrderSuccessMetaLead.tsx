"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import {
  dispatchMetaLeadCapiWithRetry,
  finalizeMetaLeadDispatch,
  isMetaLeadCapiComplete,
  isMetaLeadDispatched,
  readMetaPendingLead,
  resolveMetaLeadPayload,
  type MetaPendingLeadPayload,
} from "@/lib/meta-lead-client";
import { resolveOrderSuccessClientSession } from "@/lib/orders/order-success-session-client";

type Props = {
  orderId: string;
  completionToken?: string | null;
  actionToken?: string | null;
  /** Called when hybrid Lead dispatch settles (browser pixel queued + CAPI attempt finished). */
  onComplete?: () => void;
};

async function fireBrowserLead(payload: MetaPendingLeadPayload): Promise<void> {
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
}

/**
 * Hybrid Lead on order-success: browser Pixel fires first, then CAPI with the same
 * `event_id` (`orders.meta_event_id`) so Meta deduplicates into one Lead.
 */
export function OrderSuccessMetaLead({
  orderId,
  completionToken,
  actionToken,
  onComplete,
}: Props) {
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

        const session = resolveOrderSuccessClientSession(id, {
          completionToken,
          actionToken,
        });

        const { payload, metaLeadSent } = await resolveMetaLeadPayload(
          id,
          session ?? undefined,
        );

        const leadPayload = payload ?? readMetaPendingLead(id);

        if (!leadPayload) {
          console.warn("[Meta] Lead dispatch skipped: missing payload", {
            orderId: id,
            hasSessionTokens: Boolean(session),
            metaLeadSent,
          });
          return;
        }

        // Meta dedupes best when the browser event arrives before the server event.
        await fireBrowserLead(leadPayload);

        if (metaLeadSent) {
          finalizeMetaLeadDispatch(id);
          onComplete?.();
          return;
        }

        const eventTimeSec = Math.floor(Date.now() / 1000);
        const capiResult = await dispatchMetaLeadCapiWithRetry({
          orderId: leadPayload.orderId,
          eventId: leadPayload.eventId,
          completionToken: session?.completionToken,
          actionToken: session?.actionToken,
          eventTimeSec,
        });

        if (isMetaLeadCapiComplete(capiResult)) {
          finalizeMetaLeadDispatch(id);
          console.info("[Meta] Lead hybrid complete (Pixel → CAPI, shared event_id)", {
            orderId: leadPayload.orderId,
            eventId: leadPayload.eventId,
            capi: capiResult.state,
          });
        } else {
          console.error(
            "[Meta] Lead Pixel fired but CAPI did not ingest — check Netlify env (META_CAPI_ACCESS_TOKEN, META_CAPI_TEST_EVENT_CODE)",
            {
              orderId: leadPayload.orderId,
              eventId: leadPayload.eventId,
              capi: capiResult,
            },
          );
        }

        onComplete?.();
      } catch (error) {
        console.error("[Meta] Lead dispatch failed on order-success", error);
        onComplete?.();
      }
    })();
  }, [orderId, completionToken, actionToken, onComplete]);

  return null;
}
