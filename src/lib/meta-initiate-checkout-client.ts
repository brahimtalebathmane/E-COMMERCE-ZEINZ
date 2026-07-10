export type MetaInitiateCheckoutCapiResult =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string }
  | { state: "error"; reason: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMetaInitiateCheckoutCapiComplete(
  result: MetaInitiateCheckoutCapiResult,
): boolean {
  return result.state === "sent" || result.state === "skipped";
}

/** Server InitiateCheckout CAPI — paired with browser Pixel on CTA click. */
export async function dispatchInitiateCheckoutCapi(params: {
  productId: string;
  eventId: string;
  eventTimeSec?: number;
  eventSourceUrl?: string | null;
  metaFbp?: string | null;
  metaFbc?: string | null;
}): Promise<MetaInitiateCheckoutCapiResult> {
  try {
    const res = await fetch("/api/meta/initiate-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        product_id: params.productId,
        event_id: params.eventId,
        event_time: params.eventTimeSec,
        event_source_url: params.eventSourceUrl ?? undefined,
        meta_fbp: params.metaFbp ?? undefined,
        meta_fbc: params.metaFbc ?? undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      initiate_checkout?: MetaInitiateCheckoutCapiResult;
      error?: string;
    };
    if (!res.ok) {
      return { state: "error", reason: json.error ?? `http_${res.status}` };
    }
    if (json.initiate_checkout?.state) return json.initiate_checkout;
    return { state: "error", reason: "invalid_response" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function dispatchInitiateCheckoutCapiWithRetry(
  params: {
    productId: string;
    eventId: string;
    eventTimeSec?: number;
    eventSourceUrl?: string | null;
    metaFbp?: string | null;
    metaFbc?: string | null;
  },
  options: { maxAttempts?: number } = {},
): Promise<MetaInitiateCheckoutCapiResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let last: MetaInitiateCheckoutCapiResult = { state: "error", reason: "not_started" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    last = await dispatchInitiateCheckoutCapi(params);
    if (isMetaInitiateCheckoutCapiComplete(last)) return last;
  }

  return last;
}
