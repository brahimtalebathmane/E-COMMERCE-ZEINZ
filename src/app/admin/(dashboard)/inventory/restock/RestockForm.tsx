"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { landedUnitCosts } from "@/lib/inventory/calculations";
import { AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import {
  applySuggestedCostAction,
  createStockPurchaseAction,
  type CostSuggestion,
} from "../actions";

type Product = { productId: string; name: string; costPrice: number | null };
type Line = { key: number; productId: string; quantity: string; unitCost: string };

let lineKey = 0;
const emptyLine = (): Line => ({ key: ++lineKey, productId: "", quantity: "", unitCost: "" });

export function RestockForm({ products, today }: { products: Product[]; today: string }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(today);
  const [extraCosts, setExtraCosts] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<CostSuggestion[] | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const selectedLines = useMemo(() => lines.filter((l) => l.productId), [lines]);
  const parsedLines = useMemo(
    () =>
      selectedLines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
    [selectedLines],
  );
  const valid =
    parsedLines.length > 0 &&
    parsedLines.every((l) => Number.isInteger(l.quantity) && l.quantity > 0 && Number.isFinite(l.unitCost) && l.unitCost >= 0);
  const extra = Number(extraCosts) || 0;
  const landed = valid ? landedUnitCosts(parsedLines, extra) : [];
  const invoiceTotal = parsedLines.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0), 0) + extra;

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (saving || !valid) return;
    setSaving(true);
    try {
      const res = await createStockPurchaseAction({
        supplier,
        purchasedOn,
        extraCosts: extra,
        note,
        lines: parsedLines,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.inventory.restockDone);
      setSuggestions(res.suggestions);
      setLines([emptyLine()]);
      setSupplier("");
      setExtraCosts("");
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function apply(s: CostSuggestion) {
    const res = await applySuggestedCostAction(s.productId, s.suggestedCost);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(a.inventory.costApplied);
    setApplied((cur) => new Set(cur).add(s.productId));
  }

  return (
    <div className="space-y-5">
      {suggestions && suggestions.length > 0 ? (
        <AdminCard title={a.inventory.costSuggestionsTitle}>
          <p className="text-xs text-[var(--muted)]">{a.inventory.costSuggestionsBody}</p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.productId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-[var(--muted)]" dir="ltr">
                  {a.inventory.costCurrent}: {s.currentCost == null ? a.inventory.costNone : formatMoney(s.currentCost, "MRU")} →{" "}
                  {a.inventory.costSuggested}: {formatMoney(s.suggestedCost, "MRU")}
                </span>
                <AdminButton
                  variant="sm-ghost"
                  disabled={applied.has(s.productId) || s.currentCost === s.suggestedCost}
                  onClick={() => void apply(s)}
                >
                  {applied.has(s.productId) ? a.inventory.costApplied : a.inventory.costApply}
                </AdminButton>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <AdminCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminInput label={a.inventory.restockSupplier} value={supplier} disabled={saving} onChange={(e) => setSupplier(e.target.value)} />
          <AdminInput
            label={a.inventory.restockDate}
            type="date"
            dir="ltr"
            value={purchasedOn}
            max={today}
            disabled={saving}
            onChange={(e) => setPurchasedOn(e.target.value)}
          />
          <AdminInput
            label={a.inventory.restockExtra}
            hint={a.inventory.restockExtraHint}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            dir="ltr"
            value={extraCosts}
            disabled={saving}
            onChange={(e) => setExtraCosts(e.target.value)}
          />
          <AdminInput label={a.inventory.restockNote} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} />
        </div>

        <h3 className="mt-5 text-sm font-semibold">{a.inventory.restockLines}</h3>
        <ul className="mt-2 space-y-3">
          {lines.map((line, i) => {
            // parsedLines keeps the order of the lines that have a product.
            const position = selectedLines.indexOf(line);
            const landedForLine = valid && position >= 0 ? landed[position] : null;
            return (
              <li key={line.key} className="grid gap-2 rounded-xl border border-[var(--admin-border)] p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                <AdminSelect
                  label={a.inventory.restockProduct}
                  value={line.productId}
                  disabled={saving}
                  onChange={(e) => {
                    const product = products.find((p) => p.productId === e.target.value);
                    updateLine(line.key, {
                      productId: e.target.value,
                      unitCost: line.unitCost || (product?.costPrice != null ? String(product.costPrice) : ""),
                    });
                  }}
                >
                  <option value="">—</option>
                  {products.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.name}
                    </option>
                  ))}
                </AdminSelect>
                <AdminInput
                  label={a.inventory.restockQty}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  dir="ltr"
                  value={line.quantity}
                  disabled={saving}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
                <AdminInput
                  label={a.inventory.restockUnitCost}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={line.unitCost}
                  disabled={saving}
                  hint={landedForLine != null && extra > 0 ? `${a.inventory.landed}: ${formatMoney(landedForLine, "MRU")}` : undefined}
                  onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                />
                <AdminButton
                  variant="sm-ghost"
                  disabled={saving || lines.length === 1}
                  onClick={() => setLines((cur) => cur.filter((l) => l.key !== line.key))}
                  aria-label={`${a.inventory.restockRemoveLine} ${i + 1}`}
                >
                  {a.inventory.restockRemoveLine}
                </AdminButton>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <AdminButton variant="ghost" disabled={saving} onClick={() => setLines((cur) => [...cur, emptyLine()])}>
            {a.inventory.restockAddLine}
          </AdminButton>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--admin-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {a.inventory.restockTotal}: <span className="font-bold" dir="ltr">{formatMoney(invoiceTotal, "MRU")}</span>
          </p>
          <AdminButton disabled={saving || !valid} onClick={() => void submit()}>
            {saving ? a.inventory.saving : a.inventory.restockSubmit}
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
