/**
 * Function-calling tool definitions for the Admin Command Assistant.
 *
 * These are passed to the OpenAI Assistants run at creation time (overriding any
 * tools configured on the assistant), so no manual dashboard registration is
 * required. Every tool maps to a handler in `executor.ts`.
 */
export const ADMIN_ASSISTANT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_products",
      description:
        "List products with their id, name, slug, price and pipeline test status. Use this to find a product id before editing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional case-insensitive search over the Arabic product name or slug.",
          },
          test_status: {
            type: "string",
            enum: ["under_research", "ready_for_test", "testing", "winner", "failed"],
            description: "Optional filter by pipeline test status.",
          },
          limit: { type: "number", description: "Max rows to return (default 20, max 50)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product",
      description: "Get the full details of a single product by id or slug.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product UUID." },
          slug: { type: "string", description: "Product slug (alternative to product_id)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_product",
      description:
        "Create a new product in the research stage. Currency is always MRU. The landing page content is added later via update_product.",
      parameters: {
        type: "object",
        properties: {
          name_ar: { type: "string", description: "Arabic product name (required)." },
          price: { type: "number", description: "Selling price in MRU, must be > 0." },
          cost_price: { type: "number", description: "Cost price in MRU, >= 0." },
          sourcing_type: {
            type: "string",
            enum: ["local", "import"],
            description: "How the product is sourced.",
          },
          sourcing_link: { type: "string", description: "Internal sourcing/supplier link." },
          media_url: { type: "string", description: "Main image or video URL." },
          media_type: {
            type: "string",
            enum: ["image", "video"],
            description: "Defaults to image when omitted.",
          },
        },
        required: ["name_ar", "price", "cost_price", "sourcing_type", "sourcing_link", "media_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_product",
      description:
        "Update one or more fields of an existing product (descriptions, pricing, landing copy, sourcing). Only the provided fields change. Currency is fixed to MRU and cannot be changed.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product UUID (required)." },
          name_ar: { type: "string" },
          name_fr: { type: "string" },
          description_ar: { type: "string" },
          description_fr: { type: "string" },
          hero_subtitle_ar: { type: "string" },
          header_bar_text_ar: { type: "string" },
          cta_text_ar: { type: "string" },
          price: { type: "number", description: "MRU selling price, must be > 0." },
          discount_price: {
            type: "number",
            description: "MRU discount price (> 0). Send 0 to remove the discount.",
          },
          cost_price: { type: "number", description: "MRU cost price, >= 0." },
          meta_pixel_id: { type: "string", description: "Numeric Meta Pixel ID, or empty to clear." },
          whatsapp_message_template: {
            type: "string",
            description: "Post-order WhatsApp template text, or empty to clear.",
          },
          slug: { type: "string", description: "URL slug; old slug is preserved for redirects." },
          test_status: {
            type: "string",
            enum: ["under_research", "ready_for_test", "testing", "winner", "failed"],
          },
          sourcing_type: { type: "string", enum: ["local", "import"] },
          sourcing_link: { type: "string" },
        },
        required: ["product_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_product_test_status",
      description:
        "Update only the research/pipeline test status of a product (under_research, ready_for_test, testing, winner, failed).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product UUID." },
          test_status: {
            type: "string",
            enum: ["under_research", "ready_for_test", "testing", "winner", "failed"],
          },
        },
        required: ["product_id", "test_status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_orders",
      description:
        "Retrieve a real-time summary of recent orders (customer, phone, product, total, status, date).",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [
              "pending",
              "confirmed",
              "shipped",
              "cancelled",
              "requires_human_intervention",
            ],
            description: "Optional status filter.",
          },
          phone: { type: "string", description: "Optional phone substring filter." },
          limit: { type: "number", description: "Max rows (default 20, max 50)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order",
      description: "Get the full details of a single order by id.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order UUID." },
        },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_order_status",
      description:
        "Change an order's status across the state machine (pending → confirmed/cancelled/requires_human_intervention, confirmed → shipped/cancelled). Setting it to 'confirmed' fires the Meta CAPI Purchase event and 'cancelled' fires CancelledLead. Invalid transitions are rejected.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order UUID." },
          status: {
            type: "string",
            enum: [
              "pending",
              "confirmed",
              "shipped",
              "cancelled",
              "requires_human_intervention",
            ],
          },
        },
        required: ["order_id", "status"],
        additionalProperties: false,
      },
    },
  },
];

export const ADMIN_ASSISTANT_INSTRUCTIONS = `You are the Admin Command Assistant embedded inside the e-commerce admin dashboard (a Mauritanian cash-on-delivery store). You act on behalf of an authenticated administrator and can fully manage products and orders by calling the provided tools.

Operating rules:
- The administrator may write in Arabic, Hassaniya, French or English. Always reply in the same language they used, clearly and concisely.
- The store currency is always MRU. Never attempt to set another currency.
- To edit or inspect something you usually need its id. If the admin refers to a product or order by name/description, first call list_products or list_orders to find the matching id, then act. If multiple matches are ambiguous, ask the admin to choose.
- Only change order statuses along the allowed state machine. If a transition is rejected, explain why and suggest the valid next states.
- After every tool call that creates or modifies data, give the admin a short, explicit confirmation of exactly what changed (ids, fields, old → new values). When an order becomes confirmed or cancelled, also report whether the Meta CAPI event was sent, skipped or failed.
- If a tool returns an error, surface the error message plainly and do not pretend the action succeeded.
- Never invent ids, prices or statuses. Rely only on tool results.
- Do not mention that you are an AI model.`;
