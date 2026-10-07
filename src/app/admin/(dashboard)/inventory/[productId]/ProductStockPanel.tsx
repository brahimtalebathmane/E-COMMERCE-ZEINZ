"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateTimeAr } from "@/lib/format-date";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminKpiTile,
  AdminPageHeader,
  AdminSelect,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
  KPI_ACCENT,
} from "@/components/admin/ui";
import type { MovementRow, StockRow } from "@/lib/inventory/data";
import { recordInventoryAdjustmentAction, setLowStockThresholdAction } from "../actions";

export function ProductStockPanel({
  row,
  movements,
  live,
}: {
  row: StockRow;
  movements: MovementRow[];
  live: boolean;
}) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(row.threshold == null ? "" : String(row.threshold));
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [adjustType, setAdjustType] = useState<"adjustment" | "damage">("adjustment");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  async function saveThreshold() {
    if (savingThreshold) return;
    const trimmed = threshold.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    setSavingThreshold(true);
    try {
      const res = await setLowStockThresholdAction(row.productId, value);
      if (!res.ok) throw new Error(res.error);
      toast.success(a.inventory.saved);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingThreshold(false);
    }
  }

  async function submitAdjustment() {
    if (adjusting) return;
    const qty = Number(adjustQty);
    setAdjusting(true);
    try {
      const res = await recordInventoryAdjustmentAction({
        productId: row.productId,
        quantity: adjustType === "damage" ? -Math.abs(qty) : qty,
        type: adjustType,
        reason: adjustReason,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.inventory.adjustDone);
      setAdjustQty("");
      setAdjustReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAdjusting(false);
    }
  }

  const newestFirst = [...movements].reverse();

  return (
    <div className="space-y-5">
      <AdminPageHeader title={row.name} subtitle={a.inventory.historyTitle} />

      <section className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
        <AdminKpiTile label={a.inventory.colOnHand} value={String(row.onHand)} accent={KPI_ACCENT.products} />
        <AdminKpiTile label={a.inventory.colReserved} value={String(row.reserved)} accent={KPI_ACCENT.pending} />
        <AdminKpiTile
          label={a.inventory.colAvailable}
          value={String(row.available)}
          accent={row.level === "ok" ? KPI_ACCENT.orders : KPI_ACCENT.pending}
          emphasize
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminCard title={a.inventory.thresholdTitle}>
          <p className="text-xs text-[var(--muted)]">{a.inventory.thresholdHint}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <AdminInput
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              value={threshold}
              disabled={savingThreshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="sm:w-32"
            />
            <AdminButton disabled={savingThreshold} onClick={() => void saveThreshold()}>
              {savingThreshold ? a.inventory.saving : a.inventory.save}
            </AdminButton>
          </div>
        </AdminCard>

        {live ? (
          <AdminCard title={a.inventory.adjustTitle}>
            <p className="text-xs text-[var(--muted)]">{a.inventory.adjustHint}</p>
            <div className="mt-3 space-y-3">
              <AdminSelect
                label={a.inventory.adjustType}
                value={adjustType}
                disabled={adjusting}
                onChange={(e) => setAdjustType(e.target.value as "adjustment" | "damage")}
              >
                <option value="adjustment">{a.inventory.adjustTypeAdjustment}</option>
                <option value="damage">{a.inventory.adjustTypeDamage}</option>
              </AdminSelect>
              <AdminInput
                label={a.inventory.adjustQuantity}
                type="number"
                inputMode="numeric"
                step={1}
                dir="ltr"
                value={adjustQty}
                disabled={adjusting}
                onChange={(e) => setAdjustQty(e.target.value)}
              />
              <AdminInput
                label={a.inventory.adjustReason}
                value={adjustReason}
                disabled={adjusting}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
              <AdminButton
                disabled={adjusting || !adjustQty.trim() || !adjustReason.trim()}
                onClick={() => void submitAdjustment()}
              >
                {adjusting ? a.inventory.saving : a.inventory.adjustSubmit}
              </AdminButton>
            </div>
          </AdminCard>
        ) : null}
      </div>

      <AdminCard title={a.inventory.historyTitle} noPadding>
        {newestFirst.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">{a.inventory.historyEmpty}</p>
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <AdminTh>{a.inventory.colDate}</AdminTh>
                <AdminTh>{a.inventory.colType}</AdminTh>
                <AdminTh align="end">{a.inventory.colQuantity}</AdminTh>
                <AdminTh align="end">{a.inventory.colBalance}</AdminTh>
                <AdminTh>{a.inventory.colReason}</AdminTh>
                <AdminTh>{a.inventory.colBy}</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {newestFirst.map((m) => (
                <AdminTableRow key={m.id}>
                  <AdminTd className="whitespace-nowrap text-xs">{formatDateTimeAr(m.createdAt)}</AdminTd>
                  <AdminTd className="text-xs">
                    {a.inventory.movementTypes[m.type]}
                    {m.isCorrection ? ` · ${a.inventory.correction}` : ""}
                  </AdminTd>
                  <AdminTd align="end" mono>
                    <span className={m.quantity < 0 ? "text-red-400" : "text-emerald-400"} dir="ltr">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </AdminTd>
                  <AdminTd align="end" mono>
                    {m.balanceAfter}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {m.orderId ? (
                      <span dir="ltr" className="font-mono">
                        {a.inventory.orderRef.replace("{id}", m.orderId.slice(0, 8))}
                      </span>
                    ) : null}
                    {m.orderId && m.reason ? " · " : null}
                    {m.reason}
                    {m.unitCost != null && (m.type === "purchase" || m.type === "opening") ? (
                      <span className="text-[var(--muted)]" dir="ltr">
                        {" "}
                        ({formatMoney(m.unitCost, "MRU")})
                      </span>
                    ) : null}
                  </AdminTd>
                  <AdminTd className="text-xs text-[var(--muted)]">{m.createdByName ?? "—"}</AdminTd>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
