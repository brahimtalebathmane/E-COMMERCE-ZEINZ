"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { restoreOrdersAction } from "../actions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
  orderStatusHue,
} from "@/components/admin/ui";
import type { DeletedOrderRow } from "./types";

const DATE_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function productName(row: DeletedOrderRow): string {
  const p = row.products;
  const name = Array.isArray(p) ? p[0]?.name_ar : p?.name_ar;
  // `p` is null for an order whose product row is itself gone (see Part 2
  // item 3) — say so plainly rather than the generic "—" used elsewhere,
  // since this specific case is exactly what would otherwise look like a
  // silent data-loading bug.
  return name ?? a.deletedOrders.productDeleted;
}

export function DeletedOrdersView({
  rows,
  total,
  page,
  pageSize,
  countryName,
  showingAllCountries,
}: {
  rows: DeletedOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  countryName: string;
  showingAllCountries: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  /** Ids restored in this render pass — hidden immediately so the row does not
   *  sit there looking un-restored while the server re-render is in flight. */
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<{ ids: string[] } | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleRows = rows.filter((row) => !restoredIds.has(row.id));

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runRestore(ids: string[]) {
    startTransition(async () => {
      try {
        await restoreOrdersAction(ids);
        toast.success(a.deletedOrders.restoreSuccess);
        setRestoredIds((cur) => {
          const next = new Set(cur);
          for (const id of ids) next.add(id);
          return next;
        });
        setSelected((cur) => {
          const next = new Set(cur);
          for (const id of ids) next.delete(id);
          return next;
        });
        // The count, the pagination and the orders list all live in server
        // components — without this they keep showing the pre-restore state
        // until a full page reload.
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : a.deletedOrders.restoreFailed);
      } finally {
        setConfirming(null);
      }
    });
  }

  return (
    <AdminCard title={a.deletedOrders.title} noPadding>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3 sm:px-5">
        <p className="text-xs text-[var(--muted)]">
          {a.deletedOrders.countLabel.replace("{count}", String(total))}
        </p>
        {selected.size > 0 ? (
          <AdminButton
            type="button"
            disabled={pending}
            onClick={() => setConfirming({ ids: [...selected] })}
          >
            {a.deletedOrders.restoreSelected.replace("{count}", String(selected.size))}
          </AdminButton>
        ) : null}
      </div>

      {visibleRows.length === 0 ? (
        <div className="p-6">
          <AdminEmptyState
            title={
              showingAllCountries
                ? a.deletedOrders.emptyAllCountries
                : a.deletedOrders.empty.replace("{country}", countryName || "—")
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <AdminTable>
              <AdminTableHead>
                <AdminTableRow>
                  <AdminTh> </AdminTh>
                  <AdminTh>{a.deletedOrders.colDeletedAt}</AdminTh>
                  <AdminTh>{a.deletedOrders.colOrderedAt}</AdminTh>
                  <AdminTh>{a.orders.customer}</AdminTh>
                  <AdminTh>{a.orders.phone}</AdminTh>
                  <AdminTh>{a.orders.product}</AdminTh>
                  <AdminTh align="end">{a.orders.total}</AdminTh>
                  <AdminTh>{a.deletedOrders.colStatusAtDeletion}</AdminTh>
                  <AdminTh> </AdminTh>
                </AdminTableRow>
              </AdminTableHead>
              <AdminTableBody>
                {visibleRows.map((row) => (
                  <AdminTableRow key={row.id}>
                    <AdminTd>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={a.deletedOrders.selectRow}
                      />
                    </AdminTd>
                    <AdminTd mono>{DATE_FORMATTER.format(new Date(row.deleted_at))}</AdminTd>
                    <AdminTd mono>{DATE_FORMATTER.format(new Date(row.ordered_at))}</AdminTd>
                    <AdminTd>{row.customer_name ?? "—"}</AdminTd>
                    <AdminTd mono>
                      <span dir="ltr">{row.phone ?? "—"}</span>
                    </AdminTd>
                    <AdminTd>{productName(row)}</AdminTd>
                    <AdminTd align="end" mono>
                      {formatMoney(Number(row.total_price) || 0, row.currency)}
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge hue={orderStatusHue(row.status)} size="sm">
                        {a.orderStatus[row.status]}
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd align="end">
                      <AdminButton
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setConfirming({ ids: [row.id] })}
                      >
                        {a.deletedOrders.restore}
                      </AdminButton>
                    </AdminTd>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3 sm:px-5">
              <Link
                href={`/admin/orders/deleted?page=${Math.max(1, page - 1)}`}
                aria-disabled={page <= 1}
                className={`text-xs font-semibold ${
                  page <= 1
                    ? "pointer-events-none text-[var(--muted)] opacity-50"
                    : "text-[var(--accent)] hover:underline"
                }`}
              >
                {a.deletedOrders.prevPage}
              </Link>
              <span className="text-xs text-[var(--muted)]">
                {a.deletedOrders.pageInfo.replace("{page}", String(page)).replace("{totalPages}", String(totalPages))}
              </span>
              <Link
                href={`/admin/orders/deleted?page=${Math.min(totalPages, page + 1)}`}
                aria-disabled={page >= totalPages}
                className={`text-xs font-semibold ${
                  page >= totalPages
                    ? "pointer-events-none text-[var(--muted)] opacity-50"
                    : "text-[var(--accent)] hover:underline"
                }`}
              >
                {a.deletedOrders.nextPage}
              </Link>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={a.orders.confirmTitle}
        message={
          confirming
            ? a.deletedOrders.restoreConfirm.replace("{count}", String(confirming.ids.length))
            : ""
        }
        confirmLabel={a.deletedOrders.restore}
        cancelLabel={a.orders.cancel}
        onConfirm={() => confirming && runRestore(confirming.ids)}
        onCancel={() => setConfirming(null)}
      />
    </AdminCard>
  );
}
