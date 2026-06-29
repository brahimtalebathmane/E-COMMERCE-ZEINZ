"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Soft-delete: hides the order from admin UI while preserving audit data. */
export async function deleteOrderAction(id: string) {
  const { supabase } = await assertPermission(PERMISSIONS.cancel_orders);
  const { error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
}
