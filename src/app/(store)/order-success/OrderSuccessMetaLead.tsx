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
  type MetaLeadCapiResult,
} from "@/lib/meta-lead-client";
import { resolveOrderSuccessClientSession } from "@/lib/orders/order-success-session-client";

type Props = {
  orderId: string;
  completionToken?: string | null;
  actionToken?: string | null;
  /** Called when hybrid Lead dispatch settles (browser pixel queued + CAPI attempt finished). */
  onComplete?: () => void;
};

async function fireBrowserLead(
  payload: NonNullable<Awaited<ReturnType<typeof resolveMetaLeadPayload>>["payload"]>,
): Promise<void> {
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
 * Hybrid Lead: CAPI is sent at order create (POST /api/orders); browser Pixel fires here
 * on order-success with the same `event_id` (`lead_{orderId}`) for Meta deduplication.
 * Success-page CAPI is a retry when order-create dispatch did not ingest.
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

        let capiResult: MetaLeadCapiResult = metaLeadSent
          ? { state: "skipped", reason: "already_sent" }
          : { state: "error", reason: "not_started" };

        if (metaLeadSent) {
          await fireBrowserLead(leadPayload);
        } else {
          const [capiAttempt] = await Promise.all([
            dispatchMetaLeadCapiWithRetry({
              orderId: leadPayload.orderId,
              completionToken: session?.completionToken,
              actionToken: session?.actionToken,
            }),
            fireBrowserLead(leadPayload),
          ]);
          capiResult = capiAttempt;
        }

        if (isMetaLeadCapiComplete(capiResult)) {
          finalizeMetaLeadDispatch(id);
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

        if (isMetaLeadCapiComplete(capiResult)) {
          console.info("[Meta] Lead hybrid complete (Pixel + CAPI)", {
            orderId: leadPayload.orderId,
            eventId: leadPayload.eventId,
            capi: capiResult.state,
          });
        }
      } catch (error) {
        console.error("[Meta] Lead dispatch failed on order-success", error);
        onComplete?.();
      }
    })();
  }, [orderId, completionToken, actionToken, onComplete]);

  return null;
}
