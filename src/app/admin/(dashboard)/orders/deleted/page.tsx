import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { getAdminSession } from "@/lib/auth/admin";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCountryScope } from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { DeletedOrdersView } from "./DeletedOrdersView";
import type { DeletedOrderRow } from "./types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const DELETED_ORDER_SELECT = `
  id,
  deleted_at,
  ordered_at,
  customer_name,
  phone,
  total_price,
  currency,
  status,
  products!inner (
    name_ar,
    country_id
  )
` as const;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function DeletedOrdersPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const session = await getAdminSession();
  const access = session?.access;
  const canView = access ? hasPermission(access, PERMISSIONS.cancel_orders) : false;

  if (!canView) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.deletedOrders.title}</h1>
        <p className="mt-4 text-sm text-red-400">{a.deletedOrders.forbidden}</p>
      </div>
    );
  }

  const { selectedCountryId } = await getCountryScope();
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Deleted rows are invisible to the cookie/RLS client (orders_select_admin
  // filters deleted_at is null) — service role, after the permission gate
  // above, exactly like deleteOrdersAction/restoreOrdersAction.
  const supabase = createServiceClient();
  const { data, error, count } = await supabase
    .from("orders")
    .select(DELETED_ORDER_SELECT, { count: "exact" })
    .not("deleted_at", "is", null)
    .eq("products.country_id", selectedCountryId)
    .order("deleted_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.deletedOrders.title}</h1>
        <p className="mt-4 text-sm text-red-400">
          {a.deletedOrders.loadError} {error.message}
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as DeletedOrderRow[];
  const total = count ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link
          href="/admin/orders"
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {a.deletedOrders.backToOrders}
        </Link>
      </p>
      <DeletedOrdersView rows={rows} total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
