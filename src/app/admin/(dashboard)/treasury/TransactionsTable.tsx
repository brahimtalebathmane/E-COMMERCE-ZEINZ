"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateAr } from "@/lib/format-date";
import {
  AdminButton,
  AdminInput,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
} from "@/components/admin/ui";
import type { TreasuryTransaction } from "@/lib/treasury/data";
import { reverseTransactionAction } from "./actions";

export function TransactionsTable({
  rows,
  canManage,
}: {
  rows: TreasuryTransaction[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [reversing, setReversing] = useState<TreasuryTransaction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmReverse() {
    if (!reversing || busy) return;
    setBusy(true);
    try {
      const res = await reverseTransactionAction(reversing.id, reason);
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.saved);
      setReversing(null);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-[var(--muted)]">{a.treasury.noTransactions}</p>;
  }

  return (
    <>
      <AdminTable>
        <AdminTableHead>
          <tr>
            <AdminTh>{a.treasury.colDate}</AdminTh>
            <AdminTh>{a.treasury.colAccount}</AdminTh>
            <AdminTh>{a.treasury.colCategory}</AdminTh>
            <AdminTh>{a.treasury.colParty}</AdminTh>
            <AdminTh align="end">{a.treasury.colAmount}</AdminTh>
            <AdminTh>{a.treasury.colNote}</AdminTh>
            <AdminTh align="end">{a.treasury.colActions}</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
          {rows.map((t) => {
            const kindLabel = a.treasury.kinds[t.kind];
            const reversible =
              canManage && t.kind !== "reversal" && !t.isReversed && !t.settlementId && !t.stockPurchaseId;
            return (
              <AdminTableRow key={t.id} className={t.isReversed ? "opacity-60" : ""}>
                <AdminTd className="whitespace-nowrap text-xs">{formatDateAr(t.occurredOn)}</AdminTd>
                <AdminTd className="text-xs">{t.accountName}</AdminTd>
                <AdminTd className="text-xs">
                  {t.categoryName}
                  {kindLabel ? <span className="text-[var(--muted)]"> · {kindLabel}</span> : null}
                </AdminTd>
                <AdminTd className="text-xs">{t.partyName ?? a.treasury.none}</AdminTd>
                <AdminTd align="end" mono>
                  <span className={t.amount < 0 ? "text-red-400" : "text-emerald-400"} dir="ltr">
                    {formatMoney(t.amount, "MRU")}
                  </span>
                </AdminTd>
                <AdminTd className="max-w-[16rem] text-xs">
                  {t.orderId ? (
                    <span className="font-mono text-[var(--muted)]" dir="ltr">
                      #{t.orderId.slice(0, 8)}{" "}
                    </span>
                  ) : null}
                  {t.note}
                  {t.receiptUrl ? (
                    <>
                      {" "}
                      <a
                        href={t.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {a.treasury.receiptView}
                      </a>
                    </>
                  ) : null}
                  {t.isReversed ? <span className="text-amber-400"> · {a.treasury.reversed}</span> : null}
                </AdminTd>
                <AdminTd align="end">
                  {reversible ? (
                    <button
                      type="button"
                      onClick={() => setReversing(t)}
                      className="text-xs font-semibold text-red-300 underline-offset-2 hover:underline"
                    >
                      {a.treasury.reverse}
                    </button>
                  ) : null}
                </AdminTd>
              </AdminTableRow>
            );
          })}
        </AdminTableBody>
      </AdminTable>

      {reversing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="admin-card w-full max-w-md space-y-3 p-5">
            <h2 className="text-base font-semibold">{a.treasury.reverseTitle}</h2>
            <p className="text-xs text-[var(--muted)]">{a.treasury.reverseHint}</p>
            <p className="text-sm" dir="ltr">
              {formatMoney(reversing.amount, "MRU")} · {reversing.categoryName}
            </p>
            <AdminInput label={a.treasury.reason} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <AdminButton variant="ghost" disabled={busy} onClick={() => setReversing(null)}>
                {a.treasury.cancel}
              </AdminButton>
              <AdminButton variant="danger" disabled={busy || !reason.trim()} onClick={() => void confirmReverse()}>
                {a.treasury.confirm}
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
