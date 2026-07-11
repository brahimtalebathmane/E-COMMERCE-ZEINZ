import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { ADMIN_ORDER_SELECT } from "./queries";
import { OrdersAdminView } from "./OrdersAdminView";
import type { AdminOrderRow } from "./types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="admin-alert-error">
        {a.orders.loadError} {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as unknown as AdminOrderRow[];

  return <OrdersAdminView orders={rows} />;
}
