"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { landedUnitCosts } from "@/lib/inventory/calculations";
import { AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import { OwnerEditSheet } from "@/components/admin/OwnerEditSheet";
import type { ChangeLine } from "@/lib/owner-edits/patch";
import type { PurchaseRow } from "@/lib/inventory/data";
import { ownerSetStockPurchaseDeletedAction, ownerUpdateStockPurchaseAction } from "../../../owner/actions";

const t = a.owner;
const inv = a.inventory;

type Line = { key: string; id?: string; productId: string; quantity: string; unitCost: string };

let nextKey = 0;

/** Owner edit of a whole restock: header, every line, its stock and its treasury expense. */
export function OwnerRestockEditor({
  purchase,
  products,
}: {
  purchase: PurchaseRow;
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(purchase.supplier);
  const [purchasedOn, setPurchasedOn] = useState(purchase.purchasedOn);
  const [extra, setExtra] = useState(String(purchase.extraCosts));
  const [note, setNote] = useState(purchase.note ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    purchase.lines.map((l) => ({
      key: `l${++nextKey}`,
      id: l.id,
      productId: l.productId,
      quantity: String(l.quantity),
      unitCost: String(l.unitCost),
    })),
  );

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const parsed = lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) }));
  const valid = parsed.length > 0 && parsed.every((l) => l.productId && Number.isInteger(l.quantity) && l.quantity > 0 && Number.isFinite(l.unitCost) && l.unitCost >= 0);
  const extraNum = Number(extra) || 0;
  const total = parsed.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0), 0) + extraNum;
  const oldTotal = purchase.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0) + purchase.extraCosts;
  const landed = valid ? landedUnitCosts(parsed, extraNum) : [];

  const updateLine = (key: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineText = (l: { productId: string; quantity: number; unitCost: number }) =>
    `${productName(l.productId)} × ${l.quantity} @ ${formatMoney(l.unitCost, "MRU")}`;

  function computeChanges(): ChangeLine[] | string {
    if (!valid) return inv.restockLines;
    const out: ChangeLine[] = [];
    if (supplier.trim() !== purchase.supplier) out.push({ label: inv.restockSupplier, from: purchase.supplier || "—", to: supplier.trim() || "—" });
    if (purchasedOn !== purchase.purchasedOn) out.push({ label: inv.restockDate, from: purchase.purchasedOn, to: purchasedOn });
    if (extraNum !== purchase.extraCosts) out.push({ label: inv.restockExtra, from: formatMoney(purchase.extraCosts, "MRU"), to: formatMoney(extraNum, "MRU") });
    if ((note.trim() || null) !== (purchase.note || null)) out.push({ label: inv.restockNote, from: purchase.note || "—", to: note.trim() || "—" });
    const before = purchase.lines.map(lineText).join("، ");
    const after = parsed.map(lineText).join("، ");
    if (before !== after) out.push({ label: inv.restockLines, from: before, to: after });
    if (out.length > 0 && total !== oldTotal) {
      out.push({ label: inv.restockTotal, from: formatMoney(oldTotal, "MRU"), to: formatMoney(total, "MRU") });
    }
    return out;
  }

  async function save(reason: string) {
    const res = await ownerUpdateStockPurchaseAction({
      purchaseId: purchase.id,
      supplier,
      purchasedOn,
      extraCosts: extraNum,
      note,
      lines: lines.map((l) => ({ id: l.id, productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      reason,
    });
    if (res.ok) router.refresh();
    return res;
  }

  async function setDeleted(deleted: boolean, reason: string) {
    const res = await ownerSetStockPurchaseDeletedAction(purchase.id, deleted, reason);
    if (res.ok) router.refresh();
    return res;
  }

  return (
    <>
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[17px] font-semibold">{purchase.supplier || "—"}</p>
            <p className="text-[13px] text-[var(--muted)]" dir="ltr">
              {purchase.purchasedOn} · {formatMoney(oldTotal, "MRU")}
            </p>
          </div>
          <AdminButton onClick={() => setOpen(true)}>{purchase.deletedAt ? t.restore : t.editRestock}</AdminButton>
        </div>
        <ul className="mt-3 space-y-1 text-[15px]">
          {purchase.lines.map((l) => (
            <li key={l.id}>{lineText(l)}</li>
          ))}
        </ul>
        {purchase.treasuryTransactionId ? <p className="mt-3 text-[13px] text-[var(--muted)]">{t.restockLinkedExpense}</p> : null}
      </AdminCard>

      <OwnerEditSheet
        open={open}
        title={t.editRestockTitle}
        onClose={() => setOpen(false)}
        deleted={Boolean(purchase.deletedAt)}
        hint={purchase.treasuryTransactionId ? t.restockLinkedExpense : undefined}
        computeChanges={computeChanges}
        onSave={save}
        onDelete={(reason) => setDeleted(true, reason)}
        onRestore={(reason) => setDeleted(false, reason)}
      >
        <AdminInput label={inv.restockSupplier} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        <AdminInput label={inv.restockDate} type="date" dir="ltr" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
        <AdminInput label={inv.restockExtra} type="text" inputMode="decimal" dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <AdminInput label={inv.restockNote} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="pt-2 text-[13px] font-semibold text-[var(--muted)]">{inv.restockLines}</p>
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={l.key} className="space-y-2 rounded-[14px] bg-[var(--card)] p-3">
              <AdminSelect label={inv.restockProduct} value={l.productId} onChange={(e) => updateLine(l.key, { productId: e.target.value })}>
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </AdminSelect>
              <div className="grid grid-cols-2 gap-2">
                <AdminInput label={inv.restockQty} type="text" inputMode="numeric" dir="ltr" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                <AdminInput
                  label={inv.restockUnitCost}
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={l.unitCost}
                  hint={valid && extraNum > 0 ? `${inv.landed}: ${formatMoney(landed[i], "MRU")}` : undefined}
                  onChange={(e) => updateLine(l.key, { unitCost: e.target.value })}
                />
              </div>
              <AdminButton variant="sm-ghost" disabled={lines.length === 1} onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}>
                {inv.restockRemoveLine}
              </AdminButton>
            </li>
          ))}
        </ul>
        <AdminButton
          variant="ghost"
          onClick={() => setLines((cur) => [...cur, { key: `l${++nextKey}`, productId: "", quantity: "", unitCost: "" }])}
        >
          {inv.restockAddLine}
        </AdminButton>
        <p className="text-[15px]">
          {inv.restockTotal}: <span className="font-semibold" dir="ltr">{formatMoney(total, "MRU")}</span>
        </p>
      </OwnerEditSheet>
    </>
  );
}
