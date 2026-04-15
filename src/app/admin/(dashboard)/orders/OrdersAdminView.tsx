"use client";

import { useState } from "react";
import type { OrderStatus } from "@/types";
import type { AdminOrderRow } from "./types";
import { OrderDetailModal } from "./OrderDetailModal";
import { adminAr as a } from "@/locales/admin-ar";
import { deleteOrderAction } from "./actions";

function statusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900";
    case "confirmed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900";
    case "shipped":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900";
    case "cancelled":
      return "border-red-500/40 bg-red-500/10 text-red-900";
    default:
      return "border-[var(--accent-muted)] bg-[var(--card)] text-[var(--foreground)]";
  }
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}
    >
      {a.orderStatus[status]}
    </span>
  );
}

type Props = {
  orders: AdminOrderRow[];
};

export function OrdersAdminView({ orders }: Props) {
  const [rows, setRows] = useState<AdminOrderRow[]>(orders);
  const [active, setActive] = useState<AdminOrderRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function patchOrder(orderId: string, patch: Partial<Pick<AdminOrderRow, "status">>) {
    setRows((prev) => prev.map((row) => (row.id === orderId ? { ...row, ...patch } : row)));
    setActive((prev) => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
  }

  async function onDelete(orderId: string) {
    if (deletingId) return;
    if (!confirm(a.orders.deleteConfirm)) return;
    setDeletingId(orderId);
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== orderId));
    setActive((cur) => (cur?.id === orderId ? null : cur));
    try {
      await deleteOrderAction(orderId);
    } catch (e) {
      setRows(prev);
      throw e;
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="mt-8 space-y-3 md:hidden">
        {rows.map((o) => (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            onClick={() => setActive(o)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(o);
              }
            }}
            className="w-full cursor-pointer rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 text-start shadow-sm transition hover:border-[var(--accent-muted)]/80 hover:bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <div className="flex gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {a.orders.phone}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-sm" dir="ltr">
                    {o.phone ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <OrderStatusBadge status={o.status} />
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[var(--accent)]">
                      {a.orders.tapForDetails}
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === o.id}
                      className="min-h-[40px] rounded-lg border border-red-300 bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void onDelete(o.id).catch(() => {});
                      }}
                    >
                      {deletingId === o.id ? a.orders.deleting : a.orderActions.delete}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 hidden overflow-hidden rounded-2xl border border-[var(--accent-muted)] md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-[var(--card)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="w-[32%] px-4 py-3 text-start">{a.orders.phone}</th>
              <th className="w-[56%] px-4 py-3 text-start">{a.orders.status}</th>
              <th className="w-[12%] px-4 py-3 text-start">{a.orders.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {rows.map((o) => (
              <tr
                key={o.id}
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-[var(--card)]/60 focus-visible:bg-[var(--card)]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                onClick={() => setActive(o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(o);
                  }
                }}
              >
                <td className="px-4 py-4 align-middle">
                  <span className="break-all font-mono text-sm" dir="ltr">
                    {o.phone ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <span className="text-xs text-[var(--muted)]">{a.orders.openDetailHint}</span>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle">
                  <button
                    type="button"
                    disabled={deletingId === o.id}
                    className="min-h-[40px] rounded-xl border border-red-300 bg-[var(--card)] px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50/40 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void onDelete(o.id).catch(() => {});
                    }}
                  >
                    {deletingId === o.id ? a.orders.deleting : a.orderActions.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OrderDetailModal
        order={active}
        open={active !== null}
        onClose={() => setActive(null)}
        onDeleted={(orderId) => void onDelete(orderId).catch(() => {})}
        onOrderUpdated={patchOrder}
      />
    </>
  );
}
