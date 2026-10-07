"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AdminButton, AdminCard } from "@/components/admin/ui";
import { goLiveInventoryAction } from "../actions";

type Product = { productId: string; name: string };

/** One screen for every opening quantity; submitted once, atomically. */
export function OpeningCountForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    const lines: { productId: string; quantity: number }[] = [];
    let invalid = false;
    for (const p of products) {
      const raw = (values[p.productId] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        invalid = true;
        continue;
      }
      if (n > 0) lines.push({ productId: p.productId, quantity: n });
    }
    return { lines, invalid, total: lines.reduce((s, l) => s + l.quantity, 0) };
  }, [values, products]);

  async function submit() {
    setConfirming(false);
    if (saving) return;
    setSaving(true);
    try {
      const res = await goLiveInventoryAction(parsed.lines);
      if (!res.ok) throw new Error(res.error);
      toast.success(a.inventory.openingDone);
      router.push("/admin/inventory");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <AdminCard>
      <p className="text-sm text-[var(--muted)]">{a.inventory.openingBody}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{a.inventory.openingEmptyHint}</p>
      <ul className="mt-4 divide-y divide-[var(--admin-border)]">
        {products.map((p) => (
          <li key={p.productId} className="flex items-center justify-between gap-3 py-2">
            <label htmlFor={`count-${p.productId}`} className="text-sm font-semibold">
              {p.name}
            </label>
            <input
              id={`count-${p.productId}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              disabled={saving}
              value={values[p.productId] ?? ""}
              onChange={(e) => setValues((cur) => ({ ...cur, [p.productId]: e.target.value }))}
              className="admin-input w-28 text-end tabular-nums"
              placeholder="0"
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]" dir="rtl">
          {parsed.lines.length} / {products.length} · <span dir="ltr">{parsed.total}</span>
        </p>
        <AdminButton disabled={saving || parsed.invalid} onClick={() => setConfirming(true)}>
          {saving ? a.inventory.saving : a.inventory.openingSubmit}
        </AdminButton>
      </div>
      <ConfirmDialog
        open={confirming}
        title={a.inventory.openingConfirmTitle}
        message={a.inventory.openingConfirm
          .replace("{count}", String(parsed.lines.length))
          .replace("{total}", String(parsed.total))}
        confirmLabel={a.orders.confirm}
        cancelLabel={a.orders.cancel}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </AdminCard>
  );
}
