"use client";

import { trackLead } from "@/components/MetaPixel";
import { clearMetaSessionEventId } from "@/lib/meta-client";
import {
  clearPendingBrowserLead,
  hasBrowserLeadBeenSent,
  markBrowserLeadSent,
  readPendingBrowserLead,
} from "@/lib/meta-lead-client";
import { useEffect } from "react";

type Props = {
  metaEventId: string | null;
  metaPixelId: string | null;
};

/**
 * Fires browser Lead with the same eventID as server CAPI Lead (deduplication).
 * Runs on order-success so fbq is not cancelled by immediate navigation.
 */
export function OrderSuccessMetaLead({ metaEventId, metaPixelId }: Props) {
  useEffect(() => {
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

    void trackLead({
      value: pending.value,
      currency: pending.currency,
      eventId: pending.eventId,
      pixelId: pending.pixelId ?? metaPixelId,
      phone: pending.phone,
      customerName: pending.customerName,
    }).finally(() => {
      markBrowserLeadSent(pending.eventId);
      clearPendingBrowserLead();
      clearMetaSessionEventId();
    });
  }, [metaEventId, metaPixelId]);

  return null;
}
