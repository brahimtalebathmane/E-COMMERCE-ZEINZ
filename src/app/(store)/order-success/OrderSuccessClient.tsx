"use client";

import { useEffect } from "react";

type Props = {
  orderId: string | null;
  productId: string | null;
  productName: string | null;
  totalPrice: number | null;
  currency: string;
};

function waHandledKey(orderId: string) {
  return `whatsapp_handled:${orderId}`;
}

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

/** Whether to persist whatsapp_handled in localStorage (terminal outcome or non-retryable error). */
async function sendOrderWhatsAppWithRetries(orderId: string): Promise<boolean> {
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
        body: JSON.stringify({ order_id: orderId }),
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

    if (body.handled) {
      if (body.sent) {
        console.log("[order-success] Message sent successfully", { orderId });
      } else {
        console.warn("[order-success] WhatsApp skipped (terminal)", {
          orderId,
          skipReason: body.skipReason,
          hint: body.hint,
        });
        if (body.skipReason === "whatsapp_service_unconfigured") {
          console.info(
            "[order-success] Fix: Netlify → Site configuration → Environment variables → add WHATSAPP_SERVICE_URL = your Railway WhatsApp service URL, e.g. https://your-service.up.railway.app — then redeploy.",
          );
        }
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
  const { orderId } = props;

  useEffect(() => {
    if (!orderId) return;

    try {
      if (localStorage.getItem(waHandledKey(orderId)) === "1") return;
    } catch {
      // ignore
    }

    let cancelled = false;

    console.log("[order-success] WhatsApp message triggered", { orderId });

    (async () => {
      try {
        const markHandled = await sendOrderWhatsAppWithRetries(orderId);
        if (cancelled) return;
        if (markHandled) {
          try {
            localStorage.setItem(waHandledKey(orderId), "1");
          } catch {
            // ignore
          }
        }
      } catch (e) {
        console.error("[order-success] WhatsApp unexpected error", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return null;
}
