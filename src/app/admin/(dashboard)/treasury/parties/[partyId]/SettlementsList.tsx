"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateAr } from "@/lib/format-date";
import { AdminBadge, AdminButton, AdminInput } from "@/components/admin/ui";
import type { SettlementRow } from "@/lib/treasury/data";
import { voidSettlementAction } from "../../actions";

export function SettlementsList({ settlements, canManage }: { settlements: SettlementRow[]; canManage: boolean }) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<SettlementRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmVoid() {
    if (!voiding || busy) return;
    setBusy(true);
    try {
      const res = await voidSettlementAction(voiding.id, reason);
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.saved);
      setVoiding(null);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (settlements.length === 0) return <p className="text-sm text-[var(--muted)]">—</p>;

  return (
    <>
      <ul className="divide-y divide-[var(--admin-border)]">
        {settlements.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm ${s.voidedAt ? "opacity-60" : ""}`}>
            <span>
              <span className="font-semibold">{formatDateAr(s.settledOn)}</span>{" "}
              <span className="text-xs text-[var(--muted)]">
                {a.treasury.agentOrders.replace("{count}", String(s.orders))} · {s.accountName}
              </span>
              {s.voidedAt ? (
                <span className="ms-2">
                  <AdminBadge hue="red" size="sm">
                    {a.treasury.voided}
                  </AdminBadge>
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-3 text-xs" dir="ltr">
              <span>{formatMoney(s.collected, "MRU")}</span>
              <span className="text-[var(--muted)]">− {formatMoney(s.fees, "MRU")}</span>
              <span className="font-bold">= {formatMoney(s.received, "MRU")}</span>
              {s.difference !== 0 ? <span className="text-amber-400">({formatMoney(s.difference, "MRU")})</span> : null}
            </span>
            {canManage && !s.voidedAt ? (
              <button
                type="button"
                onClick={() => setVoiding(s)}
                className="text-xs font-semibold text-red-300 underline-offset-2 hover:underline"
              >
                {a.treasury.voidSettlement}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {voiding ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="admin-card w-full max-w-md space-y-3 p-5">
            <h2 className="text-base font-semibold">{a.treasury.voidSettlement}</h2>
            <p className="text-xs text-[var(--muted)]">{a.treasury.voidHint}</p>
            <AdminInput label={a.treasury.reason} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <AdminButton variant="ghost" disabled={busy} onClick={() => setVoiding(null)}>
                {a.treasury.cancel}
              </AdminButton>
              <AdminButton variant="danger" disabled={busy || !reason.trim()} onClick={() => void confirmVoid()}>
                {a.treasury.confirm}
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
