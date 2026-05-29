"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/auth/admin";

export async function saveAiAgentRulesAction(
  productId: string,
  systemInstruction: string,
  isActive: boolean,
) {
  const { supabase } = await assertAdminUser();
  const trimmed = systemInstruction.trim();

  const { error } = await supabase.from("ai_agent_rules").upsert(
    {
      product_id: productId,
      system_instruction: trimmed,
      is_active: isActive,
    },
    { onConflict: "product_id" },
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/products/${productId}/ai-agent`);
}
