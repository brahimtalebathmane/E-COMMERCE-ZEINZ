"use client";

import { trackLead } from "@/components/MetaPixel";
import { clearMetaSessionEventId } from "@/lib/meta-client";
import {
  clearPendingBrowserLead,
  hasBrowserLeadBeenSent,
  markBrowserLeadSent,
  readPendingBrowserLead,
} from "@/lib/meta-lead-client";
import { useEffect, useRef } from "react";

type Props = {
  metaEventId: string | null;
  metaPixelId: string | null;
};

/**
 * Fires browser Lead with the same eventID as server CAPI Lead (deduplication).
 * Runs on order-success so fbq is not cancelled by immediate navigation.
 */
export function OrderSuccessMetaLead({ metaEventId, metaPixelId }: Props) {
  // In-memory lock: blocks React StrictMode double-invoke / rapid remounts within
  // this page mount before any async work runs.
  const dispatchedRef = useRef(false);

  useEffect(() => {
    if (dispatchedRef.current) return;

    const pending = readPendingBrowserLead();
    const eventId = (metaEventId ?? pending?.eventId)?.trim();
    if (!eventId || hasBrowserLeadBeenSent(eventId)) {
      if (pending) clearPendingBrowserLead();
      return;
    }

    if (pending && pending.eventId !== eventId) {
      return;
    }

    if (!pending) return;

    // Persist the "sent" marker SYNCHRONOUSLY before the async dispatch. The
    // previous code marked sent only in `.finally()`, leaving a read-then-write
    // window where a reload, tab refocus, or client-side router transition could
    // re-enter and fire a second Lead. Locking first guarantees exactly-once even
    // across those lifecycle events (the server CAPI Lead remains the reliable
    // channel, and Meta dedupes on the shared event_id regardless).
    dispatchedRef.current = true;
    markBrowserLeadSent(pending.eventId);
    clearPendingBrowserLead();

    void trackLead({
      value: pending.value,
      currency: pending.currency,
      eventId: pending.eventId,
      pixelId: pending.pixelId ?? metaPixelId,
      phone: pending.phone,
      customerName: pending.customerName,
    }).finally(() => {
      clearMetaSessionEventId();
    });
  }, [metaEventId, metaPixelId]);

  return null;
}
