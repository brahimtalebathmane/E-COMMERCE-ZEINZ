import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminLinkButton, AdminPageHeader } from "@/components/admin/ui";
import { todayKeyNouakchott } from "@/lib/format-date";
import { loadStockRows } from "@/lib/inventory/data";
import { getAdminSession } from "@/lib/auth/admin";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getTreasuryGoLive, loadAccounts } from "@/lib/treasury/data";
import { getInventoryPageContext } from "../context";
import { RestockForm } from "./RestockForm";

export const dynamic = "force-dynamic";

export default async function InventoryRestockPage() {
  const ctx = await getInventoryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.restockTitle} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }
  if (!ctx.goLiveAt) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.restockTitle} />
        <p className="text-sm text-[var(--muted)]">{a.inventory.notLiveBody}</p>
        <AdminLinkButton href="/admin/inventory/opening">{a.inventory.enterOpeningCount}</AdminLinkButton>
      </div>
    );
  }

  const products = (await loadStockRows(ctx.service, ctx.countryId))
    .filter((r) => !r.archived)
    .map((r) => ({ productId: r.productId, name: r.name, costPrice: r.costPrice }));

  // Phase C: a restock can be paid from a treasury account in the same step.
  const session = await getAdminSession();
  const canPay = session?.access ? hasPermission(session.access, PERMISSIONS.manage_treasury) : false;
  const accounts =
    canPay && (await getTreasuryGoLive(ctx.service, ctx.countryId))
      ? (await loadAccounts(ctx.service, ctx.countryId)).filter((acc) => acc.isActive).map((acc) => ({ id: acc.id, name: acc.name }))
      : [];

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="text-xs font-semibold text-[var(--accent)]">
        {a.inventory.backToInventory}
      </Link>
      <AdminPageHeader title={a.inventory.restockTitle} />
      <RestockForm products={products} today={todayKeyNouakchott()} accounts={accounts} />
    </div>
  );
}
