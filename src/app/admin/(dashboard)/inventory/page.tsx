import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { loadRecentPurchases, loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "./context";
import { InventoryView } from "./InventoryView";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ purchases?: string }> }) {
  const [ctx, { purchases: purchasesParam }] = await Promise.all([getInventoryPageContext(), searchParams]);
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.title} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }

  const showDeleted = ctx.isOwner && purchasesParam === "deleted";
  const [rows, purchases] = await Promise.all([
    loadStockRows(ctx.service, ctx.countryId),
    loadRecentPurchases(ctx.service, ctx.countryId, showDeleted ? 50 : 5, { showDeleted }),
  ]);

  return (
    <InventoryView rows={rows} goLiveAt={ctx.goLiveAt} purchases={purchases} isOwner={ctx.isOwner} showDeletedPurchases={showDeleted} />
  );
}
