"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { AdminInput, AdminSelect } from "@/components/admin/ui";
import { OwnerEditSheet } from "@/components/admin/OwnerEditSheet";
import { describeChanges, diffFields, MOVEMENT_TYPES, type MovementPatch } from "@/lib/owner-edits/patch";
import { dayKey } from "@/lib/analytics/daily-profit";
import type { MovementRow } from "@/lib/inventory/data";
import {
  ownerResetOrderStockAction,
  ownerSetMovementDeletedAction,
  ownerSetStockAction,
  ownerUpdateMovementAction,
} from "../../owner/actions";

const t = a.owner;
const f = a.owner.fields;

type Product = { id: string; name: string };

/** Owner edit of one stock movement (any field), delete and restore. */
export function OwnerMovementEditor({
  movement,
  productId,
  products,
  onClose,
}: {
  movement: MovementRow;
  productId: string;
  products: Product[];
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = {
    product_id: productId,
    quantity: String(movement.quantity),
    type: movement.type as string,
    unit_cost: movement.unitCost == null ? "" : String(movement.unitCost),
    date: dayKey(movement.createdAt),
    note: movement.reason ?? "",
  };
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof initial>) => setForm((cur) => ({ ...cur, ...patch }));
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? t.none;

  function patchFromForm(): MovementPatch | string {
    const changed = diffFields(initial, form);
    const patch: MovementPatch = {};
    if ("product_id" in changed) patch.product_id = form.product_id;
    if ("quantity" in changed) {
      const q = Number(form.quantity);
      if (!Number.isInteger(q) || q === 0) return f.quantity;
      patch.quantity = q;
    }
    if ("type" in changed) patch.type = form.type as MovementPatch["type"];
    if ("unit_cost" in changed) patch.unit_cost = form.unit_cost.trim() === "" ? null : Number(form.unit_cost);
    if ("date" in changed) patch.date = form.date;
    if ("note" in changed) patch.note = form.note;
    return patch;
  }

  function computeChanges() {
    const patch = patchFromForm();
    if (typeof patch === "string") return patch;
    const before: Record<string, unknown> = {
      product_id: productId,
      quantity: movement.quantity,
      type: movement.type,
      unit_cost: movement.unitCost,
      date: initial.date,
      note: movement.reason,
    };
    return describeChanges(
      before,
      patch as Record<string, unknown>,
      { product_id: f.product, quantity: f.quantity, type: f.movementType, unit_cost: f.unitCost, date: f.date, note: f.note },
      (k, v) => {
        if (v == null || v === "") return t.none;
        if (k === "product_id") return productName(String(v));
        if (k === "type") return a.inventory.movementTypes[v as keyof typeof a.inventory.movementTypes] ?? String(v);
        if (k === "unit_cost") return formatMoney(Number(v), "MRU");
        return String(v);
      },
    );
  }

  async function refreshAfter<T extends { ok: boolean }>(res: T) {
    if (res.ok) router.refresh();
    return res;
  }

  return (
    <OwnerEditSheet
      open
      title={`${t.edit} · ${a.inventory.movementTypes[movement.type]}`}
      onClose={onClose}
      deleted={Boolean(movement.deletedAt)}
      hint={movement.orderId ? t.manualOrderHint : undefined}
      computeChanges={computeChanges}
      onSave={async (reason) => {
        const patch = patchFromForm();
        if (typeof patch === "string") return { ok: false as const, error: patch };
        return refreshAfter(await ownerUpdateMovementAction(movement.id, patch, reason));
      }}
      onDelete={async (reason) => refreshAfter(await ownerSetMovementDeletedAction(movement.id, true, reason))}
      onRestore={async (reason) => refreshAfter(await ownerSetMovementDeletedAction(movement.id, false, reason))}
    >
      <AdminSelect label={f.product} value={form.product_id} onChange={(e) => set({ product_id: e.target.value })}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </AdminSelect>
      <AdminInput label={f.quantity} type="text" inputMode="numeric" dir="ltr" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
      <AdminSelect label={f.movementType} value={form.type} onChange={(e) => set({ type: e.target.value })}>
        {MOVEMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {a.inventory.movementTypes[type]}
          </option>
        ))}
      </AdminSelect>
      <AdminInput label={f.unitCost} type="text" inputMode="decimal" dir="ltr" value={form.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} />
      <AdminInput label={f.date} type="date" dir="ltr" value={form.date} onChange={(e) => set({ date: e.target.value })} />
      <AdminInput label={f.note} value={form.note} onChange={(e) => set({ note: e.target.value })} />
    </OwnerEditSheet>
  );
}

/** "Set the stock to N": the difference is recorded as one adjustment. */
export function OwnerSetStockSheet({
  productId,
  onHand,
  onClose,
}: {
  productId: string;
  onHand: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(String(onHand));
  return (
    <OwnerEditSheet
      open
      title={t.setStockTitle}
      onClose={onClose}
      hint={t.setStockHint}
      computeChanges={() => {
        const n = Number(qty);
        if (!Number.isInteger(n)) return f.quantity;
        return n === onHand ? [] : [{ label: a.inventory.colOnHand, from: String(onHand), to: String(n) }];
      }}
      onSave={async (reason) => {
        const res = await ownerSetStockAction(productId, Number(qty), reason);
        if (res.ok) router.refresh();
        return res;
      }}
    >
      <p className="text-[15px] text-[var(--muted)]">{t.setStockCurrent.replace("{qty}", String(onHand))}</p>
      <AdminInput label={a.inventory.colOnHand} type="text" inputMode="numeric" dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} />
    </OwnerEditSheet>
  );
}

/** Cancels an order's manual stock edit and recomputes its movements from the order. */
export function OwnerResetOrderSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const router = useRouter();
  return (
    <OwnerEditSheet
      open
      title={t.resetManualTitle}
      onClose={onClose}
      hint={t.resetManualBody}
      computeChanges={() => [{ label: t.editedBadge, from: "✓", to: "✕" }]}
      onSave={async (reason) => {
        const res = await ownerResetOrderStockAction(orderId, reason);
        if (res.ok) router.refresh();
        return res;
      }}
    />
  );
}
