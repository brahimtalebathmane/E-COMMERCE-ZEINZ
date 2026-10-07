import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { formatMoney } from "@/lib/currency";
import { formatDateAr, todayKeyNouakchott } from "@/lib/format-date";
import { loadStockRows } from "@/lib/inventory/data";
import { getInventoryPageContext } from "../context";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

/** Printable list of every active owned product, with blank columns to fill by hand. */
export default async function InventoryCountSheetPage() {
  const ctx = await getInventoryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.inventory.printCountSheet} />
        <p className="admin-alert-error">{a.inventory.onlyLocal}</p>
      </div>
    );
  }
  const rows = (await loadStockRows(ctx.service, ctx.countryId)).filter((r) => !r.archived);
  const title = a.inventory.countSheetTitle.replace("{date}", formatDateAr(todayKeyNouakchott()));

  return (
    <div>
      {/* Print only the sheet, not the admin shell around it. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .count-sheet, .count-sheet * { visibility: visible !important; color: #000 !important; }
          .count-sheet { position: absolute; inset: 0; padding: 12mm; background: #fff; }
          .count-sheet-actions { display: none !important; }
          .count-sheet table { border-collapse: collapse; width: 100%; }
          .count-sheet th, .count-sheet td { border: 1px solid #999; padding: 6px 8px; }
        }
      `}</style>
      <div className="count-sheet space-y-4" dir="rtl">
        <div className="count-sheet-actions flex justify-end">
          <PrintButton label={a.inventory.countSheetPrint} />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-border)] text-start">
              <th className="py-2 text-start">#</th>
              <th className="py-2 text-start">{a.inventory.colProduct}</th>
              <th className="py-2 text-start">{a.inventory.countSheetCost}</th>
              <th className="w-32 py-2 text-start">{a.inventory.countSheetCounted}</th>
              <th className="w-48 py-2 text-start">{a.inventory.countSheetNotes}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.productId} className="border-b border-[var(--admin-border)]">
                <td className="py-3 tabular-nums">{i + 1}</td>
                <td className="py-3 font-semibold">{r.name}</td>
                <td className="py-3 tabular-nums" dir="ltr">
                  {r.costPrice == null ? "—" : formatMoney(r.costPrice, "MRU")}
                </td>
                <td className="py-3" />
                <td className="py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
