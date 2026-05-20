import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_AGENT_BASE_INSTRUCTIONS } from "@/lib/openai/assistant-tools";
import { applyAgentOrderStatusUpdate } from "@/lib/ai-agent/order-status";
import type { ActiveOrderContext } from "@/lib/ai-agent/order-lookup";
import { normalizePhoneForLookup } from "@/lib/ai-agent/order-lookup";

const RUN_POLL_MS = 400;
const RUN_TIMEOUT_MS = 90_000;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function getAssistantId(): string | null {
  return process.env.OPENAI_ASSISTANT_ID?.trim() || null;
}

export type InboundUserContent =
  | { type: "text"; text: string }
  | { type: "image"; text: string; imageDataUrl: string };

async function getOrCreateThread(
  supabase: SupabaseClient,
  phone: string,
  openai: OpenAI,
): Promise<string> {
  const phoneKey = normalizePhoneForLookup(phone);
  const { data: existing } = await supabase
    .from("whatsapp_chats")
    .select("openai_thread_id")
    .eq("phone_number", phoneKey)
    .maybeSingle();

  if (existing?.openai_thread_id) {
    await supabase
      .from("whatsapp_chats")
      .update({ last_interaction: new Date().toISOString() })
      .eq("phone_number", phoneKey);
    return existing.openai_thread_id as string;
  }

  const thread = await openai.beta.threads.create();
  await supabase.from("whatsapp_chats").upsert({
    phone_number: phoneKey,
    openai_thread_id: thread.id,
    last_interaction: new Date().toISOString(),
  });
  return thread.id;
}

function buildRunInstructions(
  order: ActiveOrderContext,
  productRule: string,
): string {
  const orderBlock = [
    "سياق الطلب الحالي:",
    `- order_id: ${order.orderId}`,
    `- product_id: ${order.productId}`,
    `- status: ${order.status}`,
    `- customer_name: ${order.customerName ?? "—"}`,
    `- total_price: ${order.totalPrice} ${order.currency ?? "MRU"}`,
  ].join("\n");

  const rulesBlock = productRule.trim()
    ? `قواعد هذا المنتج (من الإدارة):\n${productRule.trim()}`
    : "لا توجد قواعد مخصصة للمنتج — استخدم الحذر واطلب تدخل بشري عند الشك.";

  return `${AI_AGENT_BASE_INSTRUCTIONS}\n\n${orderBlock}\n\n${rulesBlock}`;
}

type AssistantToolCall = {
  id: string;
  type: string;
  function?: { name: string; arguments: string };
};

async function handleToolCalls(
  openai: OpenAI,
  supabase: SupabaseClient,
  threadId: string,
  runId: string,
  toolCalls: AssistantToolCall[],
): Promise<void> {
  const outputs: { tool_call_id: string; output: string }[] = [];

  for (const call of toolCalls) {
    if (call.type !== "function" || !call.function) continue;
    const fn = call.function;
    let output = JSON.stringify({ ok: false, error: "unknown_function" });

    try {
      const args = JSON.parse(fn.arguments || "{}") as Record<string, string>;
      const orderId = typeof args.order_id === "string" ? args.order_id.trim() : "";

      if (fn.name === "confirm_order_status") {
        const result = await applyAgentOrderStatusUpdate(
          supabase,
          orderId,
          "confirmed",
          "ai_agent:confirm_order_status",
        );
        output = JSON.stringify(result);
      } else if (fn.name === "request_human_intervention") {
        const reason =
          typeof args.reason === "string" ? args.reason.slice(0, 500) : "unsure";
        const result = await applyAgentOrderStatusUpdate(
          supabase,
          orderId,
          "requires_human_intervention",
          reason,
        );
        output = JSON.stringify(result);
      }
    } catch (e) {
      output = JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    outputs.push({ tool_call_id: call.id, output });
  }

  await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
    tool_outputs: outputs,
  });
}

async function waitForRunCompletion(
  openai: OpenAI,
  supabase: SupabaseClient,
  threadId: string,
  runId: string,
): Promise<OpenAI.Beta.Threads.Runs.Run> {
  const started = Date.now();
  let run = await openai.beta.threads.runs.retrieve(threadId, runId);

  while (run.status === "queued" || run.status === "in_progress") {
    if (Date.now() - started > RUN_TIMEOUT_MS) {
      throw new Error("OpenAI run timed out");
    }
    await new Promise((r) => setTimeout(r, RUN_POLL_MS));
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
  }

  if (run.status === "requires_action" && run.required_action?.type === "submit_tool_outputs") {
    const toolCalls = run.required_action.submit_tool_outputs
      .tool_calls as AssistantToolCall[];
    await handleToolCalls(openai, supabase, threadId, runId, toolCalls);
    return waitForRunCompletion(openai, supabase, threadId, runId);
  }

  return run;
}

async function extractAssistantReply(
  openai: OpenAI,
  threadId: string,
): Promise<string | null> {
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 8,
  });

  for (const msg of messages.data) {
    if (msg.role !== "assistant") continue;
    const parts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text") {
        parts.push(block.text.value);
      }
    }
    const text = parts.join("\n").trim();
    if (text) return text;
  }
  return null;
}

export type RunAgentResult =
  | { ok: true; reply: string }
  | { ok: false; reason: string; escalated?: boolean };

export async function runWhatsAppAgent(params: {
  supabase: SupabaseClient;
  phone: string;
  order: ActiveOrderContext;
  productRule: string;
  userContent: InboundUserContent;
}): Promise<RunAgentResult> {
  const openai = getOpenAIClient();
  const assistantId = getAssistantId();

  if (!openai || !assistantId) {
    await applyAgentOrderStatusUpdate(
      params.supabase,
      params.order.orderId,
      "requires_human_intervention",
      "openai_not_configured",
    );
    return { ok: false, reason: "openai_not_configured", escalated: true };
  }

  try {
    const threadId = await getOrCreateThread(params.supabase, params.phone, openai);

    const messageContent: OpenAI.Beta.Threads.Messages.MessageCreateParams["content"] =
      params.userContent.type === "text"
        ? params.userContent.text
        : [
            { type: "text", text: params.userContent.text },
            {
              type: "image_url",
              image_url: { url: params.userContent.imageDataUrl },
            },
          ];

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: messageContent,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      additional_instructions: buildRunInstructions(params.order, params.productRule),
    });

    const completed = await waitForRunCompletion(
      openai,
      params.supabase,
      threadId,
      run.id,
    );

    if (completed.status === "failed" || completed.status === "cancelled") {
      await applyAgentOrderStatusUpdate(
        params.supabase,
        params.order.orderId,
        "requires_human_intervention",
        `openai_run_${completed.status}`,
      );
      return { ok: false, reason: completed.status, escalated: true };
    }

    const reply = await extractAssistantReply(openai, threadId);
    if (!reply) {
      await applyAgentOrderStatusUpdate(
        params.supabase,
        params.order.orderId,
        "requires_human_intervention",
        "empty_assistant_reply",
      );
      return { ok: false, reason: "empty_reply", escalated: true };
    }

    return { ok: true, reply };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[runWhatsAppAgent]", msg);
    await applyAgentOrderStatusUpdate(
      params.supabase,
      params.order.orderId,
      "requires_human_intervention",
      `openai_error: ${msg.slice(0, 200)}`,
    );
    return { ok: false, reason: msg, escalated: true };
  }
}
