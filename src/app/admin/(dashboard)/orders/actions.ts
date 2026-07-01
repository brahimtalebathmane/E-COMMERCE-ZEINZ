"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";

/** Soft-delete: hides the order from admin UI while preserving audit data. */
export async function deleteOrderAction(id: string) {
  await deleteOrdersAction([id]);
}

/** Soft-delete multiple orders in one round-trip. */
export async function deleteOrdersAction(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await assertPermission(PERMISSIONS.cancel_orders);

  // Service role bypasses RLS after the permission gate above — same pattern as
  // PATCH /api/orders/[id] status updates. The user-scoped client cannot soft-
  // delete because orders_update_admin WITH CHECK rejects rows once deleted_at
  // is set (037 regression until migration 040 is applied).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", uniqueIds)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== uniqueIds.length) {
    throw new Error("Some orders could not be deleted");
  }
  revalidatePath("/admin/orders");
}
