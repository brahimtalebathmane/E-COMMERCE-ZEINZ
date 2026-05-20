/** Tool schemas — register the same definitions on your OpenAI Assistant (dashboard or API). */
export const AI_AGENT_ASSISTANT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "confirm_order_status",
      description:
        "Mark the customer's order as confirmed when they agreed to buy, sent payment proof, or met product-specific rules.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID of the order" },
          status: {
            type: "string",
            enum: ["confirmed"],
            description: "Target status (only confirmed is supported)",
          },
        },
        required: ["order_id", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_human_intervention",
      description:
        "Escalate to a human admin when unsure, the customer is angry, or rules cannot be applied safely.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID of the order" },
          reason: { type: "string", description: "Short reason for escalation (Arabic ok)" },
        },
        required: ["order_id", "reason"],
        additionalProperties: false,
      },
    },
  },
];

export const AI_AGENT_BASE_INSTRUCTIONS = `أنت مساعد واتساب لمتجر إلكتروني في موريتانيا (الدفع عند الاستلام COD).
- رد بالعربية أو الحسانية حسب أسلوب العميل.
- كن مختصراً ومحترماً.
- لا تؤكد الطلب إلا إذا تحققت شروط المنتج المخصصة أو وافق العميل صراحة أو أرسل إثباتاً واضحاً (صورة دفع/موقع).
- إذا لم تكن متأكداً 100٪، استخدم request_human_intervention ولا تخترع معلومات.
- لا تذكر أنك نموذج ذكاء اصطناعي.`;
