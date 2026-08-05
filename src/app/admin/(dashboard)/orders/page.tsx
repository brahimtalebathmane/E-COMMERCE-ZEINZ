import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { getCountryScope } from "@/lib/auth/country-scope";
import { ADMIN_ORDER_SELECT_SCOPED } from "./queries";
import { OrdersAdminView } from "./OrdersAdminView";
import { AffiliateAdminPanels, type SheetFailureRow } from "./AffiliateAdminPanels";
import type { AdminOrderRow } from "./types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { selectedCountryId } = await getCountryScope();
  const { data, error } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT_SCOPED)
    .eq("products.country_id", selectedCountryId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="admin-alert-error">
        {a.orders.loadError} {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as unknown as AdminOrderRow[];

  const awaitingCosts = rows.filter(
    (r) =>
      r.products?.fulfillment_type === "affiliate" &&
      r.products?.affiliate_commission_type === "set_price" &&
      r.status === "shipped" &&
      !r.affiliate_costs_finalized,
  );

  const sheetFailures = await loadAffiliateSheetFailures(rows);

  return (
    <>
      <AffiliateAdminPanels awaitingCosts={awaitingCosts} sheetFailures={sheetFailures} />
      <OrdersAdminView orders={rows} selectedCountryId={selectedCountryId} />
    </>
  );
}

/**
 * Affiliate orders whose most recent Google Sheet write log is a failure.
 * Bounded to affiliate orders only, and to the last 200 relevant log rows,
 * so this stays cheap regardless of overall order_communication_logs volume.
 */
async function loadAffiliateSheetFailures(rows: AdminOrderRow[]): Promise<SheetFailureRow[]> {
  const affiliateOrderIds = new Set(
    rows.filter((r) => r.products?.fulfillment_type === "affiliate").map((r) => r.id),
  );
  if (affiliateOrderIds.size === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_communication_logs")
    .select("order_id, event, detail, created_at")
    .in("event", ["affiliate_sheet_write_failed", "affiliate_sheet_write_succeeded"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const latestByOrder = new Map<string, { event: string; detail: string | null }>();
  for (const log of data) {
    if (!affiliateOrderIds.has(log.order_id)) continue;
    if (!latestByOrder.has(log.order_id)) {
      latestByOrder.set(log.order_id, { event: log.event, detail: log.detail });
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const failures: SheetFailureRow[] = [];
  for (const [orderId, latest] of latestByOrder) {
    if (latest.event !== "affiliate_sheet_write_failed") continue;
    const order = byId.get(orderId);
    failures.push({
      orderId,
      customerName: order?.customer_name ?? null,
      productName: order?.products?.name_ar ?? "—",
      detail: latest.detail,
    });
  }
  return failures;
}
