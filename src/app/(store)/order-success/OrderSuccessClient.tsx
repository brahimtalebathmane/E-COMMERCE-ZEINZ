"use client";

import { useEffect } from "react";

type Props = {
  orderId: string | null;
  completionToken: string | null;
  actionToken: string | null;
  productId: string | null;
  productName: string | null;
  totalPrice: number | null;
  currency: string;
};

const WA_MAX_ATTEMPTS = 5;
const WA_BACKOFF_MS = [0, 900, 2200, 4500, 9000];

type WaResponse = {
  handled?: boolean;
  sent?: boolean;
  skipReason?: string;
  hint?: string;
  retryable?: boolean;
  error?: string;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function sendOrderWhatsAppWithRetries(
  orderId: string,
  completionToken: string,
  actionToken: string,
): Promise<boolean> {
  let lastStatus = 0;
  let lastBody: WaResponse = {};

  for (let attempt = 0; attempt < WA_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.log("[order-success] Retrying WhatsApp send", { orderId, attempt: attempt + 1 });
    }
    await sleep(WA_BACKOFF_MS[attempt] ?? 0);

    let res: Response;
    try {
      res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          completion_token: completionToken,
          action_token: actionToken,
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[order-success] WhatsApp fetch network error", { orderId, msg });
      lastStatus = 0;
      lastBody = { retryable: true, error: msg };
      continue;
    }

    lastStatus = res.status;
    const body = (await res.json().catch(() => ({}))) as WaResponse;
    lastBody = body;

    if (res.status === 403) {
      console.error("[order-success] WhatsApp forbidden — missing or invalid action token", {
        orderId,
      });
      return true;
    }

    if (body.handled) {
      if (body.sent) {
        console.log("[order-success] Message sent successfully", { orderId });
      } else {
        console.warn("[order-success] WhatsApp skipped (terminal)", {
          orderId,
          skipReason: body.skipReason,
          hint: body.hint,
        });
      }
      return true;
    }

    const retryable =
      body.retryable === true ||
      res.status === 503 ||
      res.status === 502 ||
      res.status === 504;

    if (!retryable) {
      console.error("[order-success] WhatsApp send failed (no retry)", {
        orderId,
        status: res.status,
        error: body.error,
      });
      return true;
    }

    console.warn("[order-success] WhatsApp send failed (will retry if attempts left)", {
      orderId,
      status: res.status,
      error: body.error,
      attempt: attempt + 1,
    });
  }

  console.error("[order-success] WhatsApp send exhausted retries", {
    orderId,
    lastStatus,
    lastError: lastBody.error,
  });
  return false;
}

export function OrderSuccessClient(props: Props) {
  const { orderId, completionToken, actionToken } = props;

  useEffect(() => {
    if (!orderId || !completionToken || !actionToken) return;

    let cancelled = false;

    console.log("[order-success] WhatsApp message triggered", { orderId });

    (async () => {
      try {
        await sendOrderWhatsAppWithRetries(orderId, completionToken, actionToken);
        if (cancelled) return;
      } catch (e) {
        console.error("[order-success] WhatsApp unexpected error", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, completionToken, actionToken]);

  return null;
}
