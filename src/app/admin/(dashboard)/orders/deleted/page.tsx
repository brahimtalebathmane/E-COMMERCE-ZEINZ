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

/** No `!inner` — an order whose product row is itself gone must still show
 *  up (see Part 2 item 3), so this fetches orphans separately below rather
 *  than joining on a table that might not exist for that row. */
const ORPHAN_ORDER_SELECT = `
  id,
  deleted_at,
  ordered_at,
  customer_name,
  phone,
  total_price,
  currency,
  status
` as const;

type Props = {
  searchParams: Promise<{ page?: string; allCountries?: string }>;
};

export default async function DeletedOrdersPage({ searchParams }: Props) {
  const { page: pageParam, allCountries: allCountriesParam } = await searchParams;
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

  const { selectedCountryId, selectedCountry } = await getCountryScope();
  // A self-contained, session-local override — not persisted to the country
  // cookie — so "show me everything" never silently changes what the rest of
  // the admin panel is scoped to.
  const showAllCountries = allCountriesParam === "1";
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Deleted rows are invisible to the cookie/RLS client (orders_select_admin
  // filters deleted_at is null) — service role, after the permission gate
  // above, exactly like deleteOrdersAction/restoreOrdersAction.
  const supabase = createServiceClient();

  let scopedQuery = supabase
    .from("orders")
    .select(DELETED_ORDER_SELECT, { count: "exact" })
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (!showAllCountries) {
    scopedQuery = scopedQuery.eq("products.country_id", selectedCountryId);
  }
  const { data, error, count } = await scopedQuery.range(from, to);

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

  const scopedRows = (data ?? []) as unknown as DeletedOrderRow[];
  const scopedTotal = count ?? 0;

  // Part 2 item 3: an order whose product_id is null (or whose product row
  // no longer exists) is excluded by the `products!inner` join above and
  // would otherwise be permanently invisible from the trash — a soft-deleted
  // order must never disappear entirely. Capped like other admin-report caps
  // in this codebase; today this is 0 rows (see the SQL in the acceptance
  // criteria), so pagination for it is deliberately not built out further.
  const { data: orphanData } = await supabase
    .from("orders")
    .select(ORPHAN_ORDER_SELECT)
    .not("deleted_at", "is", null)
    .is("product_id", null)
    .order("deleted_at", { ascending: false })
    .limit(200);
  const orphanRows: DeletedOrderRow[] = (orphanData ?? []).map((o) => ({ ...o, products: null }));

  const rows = page === 1 ? [...orphanRows, ...scopedRows] : scopedRows;
  const total = scopedTotal + orphanRows.length;

  // Part 2 item 2: an empty scoped view must say whether that's because
  // there really are no deleted orders, or because they exist outside this
  // country's scope — the two must never look identical.
  let outsideScopeCount = 0;
  if (!showAllCountries && scopedRows.length === 0 && page === 1) {
    const { count: globalCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("deleted_at", "is", null);
    outsideScopeCount = Math.max(0, (globalCount ?? 0) - scopedTotal - orphanRows.length);
  }

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
      {outsideScopeCount > 0 ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
          {a.deletedOrders.outsideScope.replace("{count}", String(outsideScopeCount))}{" "}
          <Link
            href="/admin/orders/deleted?allCountries=1"
            className="font-semibold underline-offset-2 hover:underline"
          >
            {a.deletedOrders.outsideScopeLink}
          </Link>
        </p>
      ) : null}
      {showAllCountries ? (
        <p className="text-xs text-[var(--muted)]">
          {a.deletedOrders.showingAllCountries}{" "}
          <Link
            href="/admin/orders/deleted"
            className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {a.deletedOrders.backToScoped}
          </Link>
        </p>
      ) : null}
      <DeletedOrdersView
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        countryName={selectedCountry?.name_ar ?? ""}
        showingAllCountries={showAllCountries}
      />
    </div>
  );
}
