/**
 * Best-effort report of browser-side Meta CAPI retry exhaustion.
 * Fire-and-forget — never throws or blocks the page.
 */
export function reportMetaClientFailure(params: {
  eventType: "lead" | "initiate_checkout";
  eventId: string;
  orderId?: string;
  productId?: string;
  reason:
    | "capi_failed"
    | "client_retry_exhausted"
    | "http_error"
    | "network_error"
    | "missing_meta_data"
    | "error";
  attemptCount?: number;
}): void {
  const eventId = params.eventId.trim();
  if (!eventId) return;

  void fetch("/api/meta/client-failure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: params.eventType,
      eventId,
      orderId: params.orderId,
      productId: params.productId,
      reason: params.reason,
      attemptCount: params.attemptCount ?? 3,
    }),
    keepalive: true,
  }).catch(() => {
    // Silent — reporting must not create error loops.
  });
}
