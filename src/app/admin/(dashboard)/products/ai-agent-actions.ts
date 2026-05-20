"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return supabase;
}

export async function saveAiAgentRulesAction(
  productId: string,
  systemInstruction: string,
  isActive: boolean,
) {
  const supabase = await assertAdmin();
  const trimmed = systemInstruction.trim();

  const { error } = await supabase.from("ai_agent_rules").upsert(
    {
      product_id: productId,
      system_instruction: trimmed,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/products/${productId}/ai-agent`);
  revalidatePath(`/admin/products/${productId}/edit`);
  revalidatePath("/admin/products");
}
