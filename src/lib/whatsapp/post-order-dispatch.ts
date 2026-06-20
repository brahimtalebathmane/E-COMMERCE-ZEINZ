import type { SupabaseClient } from "@supabase/supabase-js";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { resolveWhatsAppServiceBase } from "@/lib/whatsapp-service-url";

const DOWNSTREAM_TIMEOUT_MS = 60_000;

/** Prepends a personalized Arabic greeting when the customer name is present. */
function buildPostOrderWhatsAppMessage(
  customerName: string | null | undefined,
  template: string,
): string {
  const name = (customerName ?? "").trim();
  if (!name) return template;
  return `مرحبا ${name}\n${template}`;
}

export type WhatsAppDispatchResult =
  | { handled: true; sent: true }
  | { handled: true; sent: false; skipReason: string; hint?: string }
  | { handled: false; sent: false; error: string; retryable: boolean };

/** Returns true if a successful post-order WhatsApp was already recorded. */
export async function hasWhatsAppPostOrderBeenSent(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  const { data: row } = await supabase
    .from("orders")
    .select("whatsapp_post_order_sent_at")
    .eq("id", orderId)
    .maybeSingle();
  if (row?.whatsapp_post_order_sent_at) return true;

  const { data: logRow } = await supabase
    .from("order_communication_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("event", "whatsapp_sent")
    .limit(1)
    .maybeSingle();
  return Boolean(logRow);
}

/**
 * Claim server-side dedupe slot (one in-flight / one success per order).
 * Returns false if another request already claimed or completed send.
 */
async function claimWhatsAppDispatch(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  const { error } = await supabase.from("order_whatsapp_dispatches").insert({
    order_id: orderId,
    status: "pending",
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function releaseWhatsAppClaim(supabase: SupabaseClient, orderId: string): Promise<void> {
  await supabase.from("order_whatsapp_dispatches").delete().eq("order_id", orderId);
}

async function markWhatsAppSent(supabase: SupabaseClient, orderId: string): Promise<void> {
  await supabase
    .from("order_whatsapp_dispatches")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("order_id", orderId);
  await supabase
    .from("orders")
    .update({ whatsapp_post_order_sent_at: new Date().toISOString() })
    .eq("id", orderId);
}

export async function dispatchPostOrderWhatsApp(
  supabase: SupabaseClient,
  orderId: string,
): Promise<WhatsAppDispatchResult> {
  if (await hasWhatsAppPostOrderBeenSent(supabase, orderId)) {
    return { handled: true, sent: false, skipReason: "already_sent" };
  }

  const claimed = await claimWhatsAppDispatch(supabase, orderId);
  if (!claimed) {
    if (await hasWhatsAppPostOrderBeenSent(supabase, orderId)) {
      return { handled: true, sent: false, skipReason: "already_sent" };
    }
    return {
      handled: false,
      sent: false,
      error: "WhatsApp dispatch in progress",
      retryable: true,
    };
  }

  try {
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, phone, product_id, customer_name")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) {
      await releaseWhatsAppClaim(supabase, orderId);
      return { handled: true, sent: false, skipReason: "order_not_found" };
    }

    await logOrderCommunicationEvent(supabase, orderId, "whatsapp_triggered", null);

    const phone = (order.phone as string | null | undefined) ?? null;
    const productId = (order.product_id as string | null | undefined) ?? null;
    if (!phone || !productId) {
      const detail = !phone ? "missing_phone" : "missing_product_id";
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_skipped", detail);
      await releaseWhatsAppClaim(supabase, orderId);
      return { handled: true, sent: false, skipReason: detail };
    }

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, whatsapp_message_template")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) {
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_skipped", "product_not_found");
      await releaseWhatsAppClaim(supabase, orderId);
      return { handled: true, sent: false, skipReason: "product_not_found" };
    }

    const template = ((product.whatsapp_message_template as string | null) ?? "").trim();
    if (!template) {
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_skipped", "no_whatsapp_template");
      await releaseWhatsAppClaim(supabase, orderId);
      return { handled: true, sent: false, skipReason: "no_whatsapp_template" };
    }

    const text = buildPostOrderWhatsAppMessage(
      order.customer_name as string | null | undefined,
      template,
    );

    const base = resolveWhatsAppServiceBase();
    if (!base) {
      await logOrderCommunicationEvent(
        supabase,
        orderId,
        "whatsapp_skipped",
        "whatsapp_service_unconfigured",
      );
      await releaseWhatsAppClaim(supabase, orderId);
      return {
        handled: true,
        sent: false,
        skipReason: "whatsapp_service_unconfigured",
        hint:
          "Set WHATSAPP_SERVICE_URL on the Next.js host to your always-on WhatsApp service base URL.",
      };
    }

    const url = `${base}/api/send-whatsapp`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DOWNSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
        signal: ac.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_failed", `fetch: ${msg}`);
      await releaseWhatsAppClaim(supabase, orderId);
      return { handled: false, sent: false, error: msg, retryable: true };
    } finally {
      clearTimeout(timer);
    }

    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const errText = json.error || `WhatsApp service returned ${res.status}`;
      await logOrderCommunicationEvent(
        supabase,
        orderId,
        "whatsapp_failed",
        `${res.status}: ${errText}`,
      );
      await releaseWhatsAppClaim(supabase, orderId);
      const retryable =
        res.status === 503 || res.status === 502 || res.status === 504 || res.status >= 500;
      return {
        handled: false,
        sent: false,
        error: errText,
        retryable,
      };
    }

    await logOrderCommunicationEvent(supabase, orderId, "whatsapp_sent", null);
    await markWhatsAppSent(supabase, orderId);
    return { handled: true, sent: true };
  } catch (e) {
    await releaseWhatsAppClaim(supabase, orderId);
    throw e;
  }
}
