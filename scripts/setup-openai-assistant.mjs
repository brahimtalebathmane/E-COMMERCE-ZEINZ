/**
 * One-time helper: creates an OpenAI Assistant with the tools this app expects.
 * Usage: OPENAI_API_KEY=sk-... node scripts/setup-openai-assistant.mjs
 */
import OpenAI from "openai";

const tools = [
  {
    type: "function",
    function: {
      name: "confirm_order_status",
      description:
        "Mark the order confirmed when the customer agreed or met product rules.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          status: { type: "string", enum: ["confirmed"] },
        },
        required: ["order_id", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_intervention",
      description: "Escalate to human staff when unsure.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["order_id", "reason"],
        additionalProperties: false,
      },
    },
  },
];

const instructions = `مساعد واتساب لمتجر COD في موريتانيا. رد بالعربية أو الحسانية. استخدم الأدوات عند التأكد فقط.`;

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error("Set OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: key });
const assistant = await openai.beta.assistants.create({
  name: "ZAINE WhatsApp Order Agent",
  model: "gpt-4o",
  instructions,
  tools,
});

console.log("Created assistant. Add to your env:");
console.log(`OPENAI_ASSISTANT_ID=${assistant.id}`);
