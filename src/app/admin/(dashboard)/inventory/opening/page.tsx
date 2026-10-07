import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminCard, AdminLinkButton, AdminPageHeader } from "@/components/admin/ui";
import { formatDateTimeAr } from "@/lib/format-date";
import { loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "../context";
import { OpeningCountForm } from "./OpeningCountForm";

export const dynamic = "force-dynamic";

export default async function InventoryOpeningPage() {
  const ctx = await getInventoryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.openingTitle} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }

  if (ctx.goLiveAt) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.openingTitle} />
        <AdminCard>
          <p className="text-sm">{a.inventory.openingAlreadyLive.replace("{date}", formatDateTimeAr(ctx.goLiveAt))}</p>
          <div className="mt-3">
            <AdminLinkButton href="/admin/inventory" variant="ghost">
              {a.inventory.backToInventory}
            </AdminLinkButton>
          </div>
        </AdminCard>
      </div>
    );
  }

  const products = (await loadStockRows(ctx.service, ctx.countryId))
    .filter((r) => !r.archived)
    .map((r) => ({ productId: r.productId, name: r.name }));

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="text-xs font-semibold text-[var(--accent)]">
        {a.inventory.backToInventory}
      </Link>
      <AdminPageHeader
        title={a.inventory.openingTitle}
        actions={
          <AdminLinkButton href="/admin/inventory/count-sheet" variant="ghost">
            {a.inventory.printCountSheet}
          </AdminLinkButton>
        }
      />
      <OpeningCountForm products={products} />
    </div>
  );
}
