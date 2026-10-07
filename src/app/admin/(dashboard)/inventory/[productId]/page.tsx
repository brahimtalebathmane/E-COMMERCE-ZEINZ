import Link from "next/link";
import { notFound } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { loadProductMovements, loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "../context";
import { ProductStockPanel } from "./ProductStockPanel";

export const dynamic = "force-dynamic";

export default async function InventoryProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ctx = await getInventoryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.title} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }

  const [rows, movements] = await Promise.all([
    loadStockRows(ctx.service, ctx.countryId),
    loadProductMovements(ctx.service, ctx.countryId, productId),
  ]);
  const row = rows.find((r) => r.productId === productId);
  if (!row) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="text-xs font-semibold text-[var(--accent)]">
        {a.inventory.backToInventory}
      </Link>
      <ProductStockPanel row={row} movements={movements} live={Boolean(ctx.goLiveAt)} />
    </div>
  );
}
