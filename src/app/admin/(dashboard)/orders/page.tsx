import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { OrdersAdminView } from "./OrdersAdminView";
import type { AdminOrderRow } from "./types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      product_id,
      customer_name,
      phone,
      total_price,
      currency,
      status,
      completion_token,
      created_at,
      products (
        name_ar,
        slug,
        price,
        discount_price,
        media_type,
        media_url
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-600">
        {a.orders.loadError} {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as unknown as AdminOrderRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.orders.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.orders.subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{a.orders.noOrders}</p>
      ) : (
        <OrdersAdminView orders={rows} />
      )}
    </div>
  );
}
