import type OpenAI from "openai";
import { getAssistantId, getOpenAIClient } from "@/lib/openai/client";
import {
  ADMIN_ASSISTANT_INSTRUCTIONS,
  ADMIN_ASSISTANT_TOOLS,
} from "@/lib/admin-assistant/tool-schemas";
import { executeAdminTool, type AdminToolContext } from "@/lib/admin-assistant/executor";

const RUN_POLL_MS = 500;
const RUN_TIMEOUT_MS = 110_000;

type AssistantToolCall = {
  id: string;
  type: string;
  function?: { name: string; arguments: string };
};

export type AdminAssistantResult =
  | { ok: true; reply: string; threadId: string }
  | { ok: false; reason: string };

async function handleRequiredAction(
  openai: OpenAI,
  ctx: AdminToolContext,
  threadId: string,
  runId: string,
  toolCalls: AssistantToolCall[],
): Promise<void> {
  const outputs: { tool_call_id: string; output: string }[] = [];

  for (const call of toolCalls) {
    if (call.type !== "function" || !call.function) {
      outputs.push({
        tool_call_id: call.id,
        output: JSON.stringify({ ok: false, error: "unsupported_tool_type" }),
      });
      continue;
    }
    const output = await executeAdminTool(
      ctx,
      call.function.name,
      call.function.arguments || "{}",
    );
    outputs.push({ tool_call_id: call.id, output });
  }

  await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
    tool_outputs: outputs,
  });
}

async function waitForRunCompletion(
  openai: OpenAI,
  ctx: AdminToolContext,
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

  if (
    run.status === "requires_action" &&
    run.required_action?.type === "submit_tool_outputs"
  ) {
    const toolCalls = run.required_action.submit_tool_outputs
      .tool_calls as AssistantToolCall[];
    await handleRequiredAction(openai, ctx, threadId, runId, toolCalls);
    return waitForRunCompletion(openai, ctx, threadId, runId);
  }

  return run;
}

async function extractAssistantReply(
  openai: OpenAI,
  threadId: string,
): Promise<string | null> {
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 10,
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

export async function runAdminAssistant(params: {
  ctx: AdminToolContext;
  userText: string;
  threadId?: string | null;
}): Promise<AdminAssistantResult> {
  const openai = getOpenAIClient();
  const assistantId = getAssistantId();

  if (!openai || !assistantId) {
    return {
      ok: false,
      reason:
        "OpenAI is not configured. Set OPENAI_API_KEY and OPENAI_ASSISTANT_ID on the server.",
    };
  }

  try {
    const threadId =
      params.threadId?.trim() || (await openai.beta.threads.create()).id;

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: params.userText,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      instructions: ADMIN_ASSISTANT_INSTRUCTIONS,
      tools: ADMIN_ASSISTANT_TOOLS,
    });

    const completed = await waitForRunCompletion(
      openai,
      params.ctx,
      threadId,
      run.id,
    );

    if (completed.status !== "completed") {
      return {
        ok: false,
        reason: `Assistant run ${completed.status}`,
      };
    }

    const reply = await extractAssistantReply(openai, threadId);
    if (!reply) {
      return { ok: false, reason: "empty_reply" };
    }

    return { ok: true, reply, threadId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[runAdminAssistant]", msg);
    return { ok: false, reason: msg };
  }
}
