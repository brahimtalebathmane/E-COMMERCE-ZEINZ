import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { loadRecentPurchases, loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "../../context";
import { OwnerRestockEditor } from "./OwnerRestockEditor";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner only: edit, delete or restore one restock. */
export default async function OwnerRestockEditPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const [{ purchaseId }, ctx] = await Promise.all([params, getInventoryPageContext()]);
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.owner.editRestockTitle} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }
  if (!ctx.isOwner) redirect("/admin/inventory");
  if (!UUID_RE.test(purchaseId)) notFound();

  const [purchases, rows] = await Promise.all([
    loadRecentPurchases(ctx.service, ctx.countryId, 1, { purchaseId }),
    loadStockRows(ctx.service, ctx.countryId),
  ]);
  const purchase = purchases[0];
  if (!purchase) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-[var(--accent)]">
        {a.inventory.backToInventory}
      </Link>
      <AdminPageHeader title={a.owner.editRestockTitle} />
      <OwnerRestockEditor purchase={purchase} products={rows.map((r) => ({ id: r.productId, name: r.name }))} />
    </div>
  );
}
