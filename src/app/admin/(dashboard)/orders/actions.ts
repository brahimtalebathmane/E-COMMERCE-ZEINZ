"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/auth/admin";

export async function deleteOrderAction(id: string) {
  const { supabase } = await assertAdminUser();
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
}
