"use client";

import { useState } from "react";
import type { OrderStatus } from "@/types";
import type { AdminOrderRow } from "./types";
import { ReceiptThumbnail } from "./ReceiptThumbnail";
import { OrderDetailModal } from "./OrderDetailModal";
import { adminAr as a } from "@/locales/admin-ar";

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
  const [active, setActive] = useState<AdminOrderRow | null>(null);

  return (
    <>
      <div className="mt-8 space-y-3 md:hidden">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setActive(o)}
            className="w-full rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 text-start shadow-sm transition hover:border-[var(--accent-muted)]/80 hover:bg-[var(--background)]"
          >
            <div className="flex gap-4">
              <ReceiptThumbnail storagePath={o.receipt_image_url} variant="list" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {a.orders.phone}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-sm" dir="ltr">
                    {o.phone ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {a.orders.address}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {o.address ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <OrderStatusBadge status={o.status} />
                  <span className="text-xs font-medium text-[var(--accent)]">
                    {a.orders.tapForDetails}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 hidden overflow-hidden rounded-2xl border border-[var(--accent-muted)] md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-[var(--card)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="w-[22%] px-4 py-3 text-start">{a.orders.phone}</th>
              <th className="w-[38%] px-4 py-3 text-start">{a.orders.address}</th>
              <th className="w-[14%] px-4 py-3 text-center">{a.orders.receiptThumb}</th>
              <th className="w-[26%] px-4 py-3 text-start">{a.orders.status}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {orders.map((o) => (
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
                  <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
                    {o.address ?? "—"}
                  </p>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex justify-center">
                    <ReceiptThumbnail storagePath={o.receipt_image_url} variant="list" />
                  </div>
                </td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <span className="text-xs text-[var(--muted)]">{a.orders.openDetailHint}</span>
                  </div>
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
      />
    </>
  );
}
