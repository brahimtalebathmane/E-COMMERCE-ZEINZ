import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { loadRecentPurchases, loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "./context";
import { InventoryView } from "./InventoryView";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await getInventoryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.title} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }

  const [rows, purchases] = await Promise.all([
    loadStockRows(ctx.service, ctx.countryId),
    loadRecentPurchases(ctx.service, ctx.countryId, 5),
  ]);

  return <InventoryView rows={rows} goLiveAt={ctx.goLiveAt} purchases={purchases} />;
}
