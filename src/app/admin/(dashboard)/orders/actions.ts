"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Soft-delete: hides the order from admin UI while preserving audit data. */
export async function deleteOrderAction(id: string) {
  await deleteOrdersAction([id]);
}

/** Soft-delete multiple orders in one round-trip. */
export async function deleteOrdersAction(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const { supabase } = await assertPermission(PERMISSIONS.cancel_orders);
  const { error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", uniqueIds)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
}
