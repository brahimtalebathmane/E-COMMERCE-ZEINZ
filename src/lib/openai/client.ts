import OpenAI from "openai";

/**
 * Base connection layer to the OpenAI Assistants API.
 *
 * This is the only OpenAI wiring retained after the WhatsApp inbound agent was
 * removed. It is reused by the Admin Command Assistant.
 */
export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export function getAssistantId(): string | null {
  return process.env.OPENAI_ASSISTANT_ID?.trim() || null;
}
