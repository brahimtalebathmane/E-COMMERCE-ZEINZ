"use client";

import { clearPendingBrowserLead } from "@/lib/meta-lead-client";
import { useEffect } from "react";

/**
 * Clears any legacy deferred Lead payload from sessionStorage.
 * Browser Lead now fires exclusively in OrderFormModal after a successful API
 * response — this component must never dispatch a second Lead on order-success.
 */
export function OrderSuccessMetaLead() {
  useEffect(() => {
    clearPendingBrowserLead();
  }, []);

  return null;
}
