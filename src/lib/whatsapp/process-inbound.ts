import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchActiveAgentRule,
  findLatestActiveOrderByPhone,
  normalizePhoneForLookup,
} from "@/lib/ai-agent/order-lookup";
import { applyAgentOrderStatusUpdate } from "@/lib/ai-agent/order-status";
import { runWhatsAppAgent, type InboundUserContent } from "@/lib/openai/run-agent";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { sendWhatsAppReply } from "@/lib/whatsapp/send-reply";

export type WhatsAppInboundPayload = {
  phone: string;
  text?: string | null;
  image_data_url?: string | null;
  message_id?: string | null;
};

const FALLBACK_AR =
  "شكراً لتواصلك. فريقنا سيراجع طلبك ويرد عليك قريباً إن شاء الله.";

const HUMAN_ESCALATION_AR =
  "تم تحويل طلبك لفريق المتابعة. سيتواصل معك أحد موظفينا قريباً.";

export async function processWhatsAppInbound(
  payload: WhatsAppInboundPayload,
): Promise<{ handled: boolean; reason?: string }> {
  const phone = normalizePhoneForLookup(payload.phone);
  if (!phone) {
    return { handled: false, reason: "invalid_phone" };
  }

  const text = (payload.text ?? "").trim();
  const imageDataUrl =
    typeof payload.image_data_url === "string" && payload.image_data_url.startsWith("data:")
      ? payload.image_data_url
      : null;

  if (!text && !imageDataUrl) {
    return { handled: false, reason: "empty_message" };
  }

  const supabase = createServiceClient();
  const order = await findLatestActiveOrderByPhone(supabase, phone);

  if (!order) {
    await sendWhatsAppReply(
      phone,
      "مرحباً. لم نجد طلباً نشطاً مرتبطاً برقمك. إذا طلبت للتو، انتظر رسالة التأكيد أو تواصل مع الدعم.",
    );
    return { handled: true, reason: "no_active_order" };
  }

  await logOrderCommunicationEvent(
    supabase,
    order.orderId,
    "whatsapp_triggered",
    payload.message_id ? `inbound:${payload.message_id}` : "inbound",
  );

  const rule = await fetchActiveAgentRule(supabase, order.productId);
  if (!rule?.isActive || !rule.systemInstruction.trim()) {
    await applyAgentOrderStatusUpdate(
      supabase,
      order.orderId,
      "requires_human_intervention",
      "ai_agent_inactive_or_no_rules",
    );
    await sendWhatsAppReply(phone, HUMAN_ESCALATION_AR);
    return { handled: true, reason: "agent_inactive" };
  }

  const userContent: InboundUserContent = imageDataUrl
    ? {
        type: "image",
        text: text || "صورة من العميل (قد تكون إثبات دفع أو موقع)",
        imageDataUrl,
      }
    : { type: "text", text };

  const agentResult = await runWhatsAppAgent({
    supabase,
    phone,
    order,
    productRule: rule.systemInstruction,
    userContent,
  });

  let replyText: string;
  if (agentResult.ok) {
    replyText = agentResult.reply;
    await logOrderCommunicationEvent(supabase, order.orderId, "ai_agent_replied", null);
  } else if (agentResult.escalated) {
    replyText = HUMAN_ESCALATION_AR;
  } else {
    replyText = FALLBACK_AR;
    await applyAgentOrderStatusUpdate(
      supabase,
      order.orderId,
      "requires_human_intervention",
      agentResult.reason,
    );
  }

  const send = await sendWhatsAppReply(phone, replyText);
  if (send.sent) {
    await logOrderCommunicationEvent(supabase, order.orderId, "whatsapp_sent", "ai_reply");
  } else {
    await logOrderCommunicationEvent(
      supabase,
      order.orderId,
      "whatsapp_failed",
      send.error ?? "send_failed",
    );
  }

  return { handled: true };
}
