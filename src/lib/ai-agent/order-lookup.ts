import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveOrderContext = {
  orderId: string;
  productId: string;
  status: string;
  customerName: string | null;
  totalPrice: number;
  currency: string | null;
};

/** Normalize phone for consistent DB lookup (E.164-style). */
export function normalizePhoneForLookup(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : trimmed;
}

function phoneLookupVariants(phone: string): string[] {
  const e164 = normalizePhoneForLookup(phone);
  const digits = e164.replace(/\D/g, "");
  const variants = new Set<string>();
  if (e164) variants.add(e164);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
    if (digits.startsWith("222")) variants.add(digits.slice(3));
  }
  return [...variants].filter(Boolean);
}

/**
 * Latest order for this phone that is still actionable by the agent
 * (pending or awaiting human follow-up).
 */
export async function findLatestActiveOrderByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<ActiveOrderContext | null> {
  const variants = phoneLookupVariants(phone);
  if (variants.length === 0) return null;

  const { data, error } = await supabase
    .from("orders")
    .select("id, product_id, status, customer_name, total_price, currency, phone, created_at")
    .in("phone", variants)
    .in("status", ["pending", "requires_human_intervention"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;

  return {
    orderId: row.id as string,
    productId: row.product_id as string,
    status: row.status as string,
    customerName: (row.customer_name as string | null) ?? null,
    totalPrice: Number(row.total_price),
    currency: (row.currency as string | null) ?? null,
  };
}

export async function fetchActiveAgentRule(
  supabase: SupabaseClient,
  productId: string,
): Promise<{ systemInstruction: string; isActive: boolean } | null> {
  const { data, error } = await supabase
    .from("ai_agent_rules")
    .select("system_instruction, is_active")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    systemInstruction: (data.system_instruction as string) || "",
    isActive: Boolean(data.is_active),
  };
}
