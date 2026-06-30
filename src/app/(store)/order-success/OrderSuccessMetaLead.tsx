"use client";

import { useEffect, useRef } from "react";
import { trackLead } from "@/components/MetaPixel";
import { consumeMetaPendingLead, dispatchMetaLeadCapi } from "@/lib/meta-lead-client";

type Props = {
  orderId: string;
};

/**
 * Fires browser Lead and server Lead CAPI together on order-success load so Meta
 * receives both channels at the same moment (shared event_id for deduplication).
 */
export function OrderSuccessMetaLead({ orderId }: Props) {
  const startedRef = useRef(false);

  useEffect(() => {
    const id = orderId.trim();
    if (!id || startedRef.current) return;
    startedRef.current = true;

    const payload = consumeMetaPendingLead(id);
    if (!payload) {
      // #region agent log
      fetch("http://127.0.0.1:7481/ingest/e5ab9c4f-3cf6-4050-b164-44ac5ad50fe7", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d3a9b" },
        body: JSON.stringify({
          sessionId: "5d3a9b",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "OrderSuccessMetaLead.tsx:consume",
          message: "No pending Lead payload",
          data: { orderId: id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return;
    }

    // #region agent log
    fetch("http://127.0.0.1:7481/ingest/e5ab9c4f-3cf6-4050-b164-44ac5ad50fe7", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d3a9b" },
      body: JSON.stringify({
        sessionId: "5d3a9b",
        runId: "pre-fix",
        hypothesisId: "H1-H2",
        location: "OrderSuccessMetaLead.tsx:start",
        message: "Lead dispatch starting",
        data: {
          orderId: payload.orderId,
          eventIdLen: payload.eventId.length,
          eventIdPrefix: payload.eventId.slice(0, 20),
          pixelIdPrefix: payload.pixelId?.slice(0, 8) ?? null,
          pixelsInited: typeof window !== "undefined" ? Object.keys(window.__metaPixelsInited ?? {}) : [],
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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
          }),
        ]);

        // #region agent log
        fetch("http://127.0.0.1:7481/ingest/e5ab9c4f-3cf6-4050-b164-44ac5ad50fe7", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d3a9b" },
          body: JSON.stringify({
            sessionId: "5d3a9b",
            runId: "pre-fix",
            hypothesisId: "H1-H3",
            location: "OrderSuccessMetaLead.tsx:done",
            message: "Lead dispatch finished",
            data: {
              orderId: payload.orderId,
              browserEventIdPrefix: payload.eventId.slice(0, 20),
              capiState: capiResult.state,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

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
  }, [orderId]);

  return null;
}
