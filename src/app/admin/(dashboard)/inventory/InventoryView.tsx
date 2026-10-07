"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateAr, formatDateTimeAr } from "@/lib/format-date";
import {
  AdminBadge,
  AdminCard,
  AdminLinkButton,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
} from "@/components/admin/ui";
import type { PurchaseRow, StockRow } from "@/lib/inventory/data";

type Filter = "all" | "low" | "negative";

function availableClass(level: StockRow["level"]): string {
  if (level === "negative") return "font-bold text-red-400";
  if (level === "low") return "font-bold text-amber-400";
  return "text-[var(--foreground)]";
}

export function InventoryView({
  rows,
  goLiveAt,
  purchases,
}: {
  rows: StockRow[];
  goLiveAt: string | null;
  purchases: PurchaseRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const lowCount = rows.filter((r) => r.level === "low").length;
  const negativeCount = rows.filter((r) => r.level === "negative").length;

  const visible = useMemo(() => {
    if (filter === "low") return rows.filter((r) => r.level === "low");
    if (filter === "negative") return rows.filter((r) => r.level === "negative");
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={a.inventory.title}
        subtitle={goLiveAt ? a.inventory.liveSince.replace("{date}", formatDateTimeAr(goLiveAt)) : a.inventory.subtitle}
        actions={
          goLiveAt ? (
            <AdminLinkButton href="/admin/inventory/restock">{a.inventory.restock}</AdminLinkButton>
          ) : null
        }
      />

      {!goLiveAt ? (
        <AdminCard title={a.inventory.notLiveTitle}>
          <p className="text-sm text-[var(--muted)]">{a.inventory.notLiveBody}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <AdminLinkButton href="/admin/inventory/count-sheet" variant="ghost">
              {a.inventory.printCountSheet}
            </AdminLinkButton>
            <AdminLinkButton href="/admin/inventory/opening">{a.inventory.enterOpeningCount}</AdminLinkButton>
          </div>
        </AdminCard>
      ) : null}

      {negativeCount > 0 ? (
        <p className="admin-alert-error">{a.inventory.negativeCount.replace("{count}", String(negativeCount))}</p>
      ) : null}
      {lowCount > 0 ? (
        <p className="text-sm font-semibold text-amber-400">
          {a.inventory.lowCount.replace("{count}", String(lowCount))}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["all", a.inventory.filterAll, rows.length],
            ["low", a.inventory.filterLow, lowCount],
            ["negative", a.inventory.filterNegative, negativeCount],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-[40px] rounded-xl border px-3 text-sm font-semibold transition ${
              filter === id
                ? "border-[var(--accent)] bg-[var(--accent-muted)]/30 text-[var(--foreground)]"
                : "border-[var(--admin-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{a.inventory.noProducts}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{a.inventory.noneInFilter}</p>
      ) : (
        <AdminTable>
          <AdminTableHead>
            <tr>
              <AdminTh>{a.inventory.colProduct}</AdminTh>
              <AdminTh align="end">{a.inventory.colOnHand}</AdminTh>
              <AdminTh align="end">{a.inventory.colReserved}</AdminTh>
              <AdminTh align="end">{a.inventory.colAvailable}</AdminTh>
              <AdminTh align="end">{a.inventory.colThreshold}</AdminTh>
              <AdminTh align="end">{a.inventory.colHistory}</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {visible.map((row) => (
              <AdminTableRow key={row.productId}>
                <AdminTd>
                  <span className="font-semibold">{row.name}</span>
                  {row.archived ? (
                    <span className="ms-2">
                      <AdminBadge hue="neutral" size="sm">
                        {a.inventory.archived}
                      </AdminBadge>
                    </span>
                  ) : null}
                </AdminTd>
                <AdminTd align="end" mono>
                  {row.onHand}
                </AdminTd>
                <AdminTd align="end" mono>
                  {row.reserved}
                </AdminTd>
                <AdminTd align="end" mono>
                  <span className={availableClass(row.level)}>{row.available}</span>
                </AdminTd>
                <AdminTd align="end" mono>
                  {row.threshold ?? "—"}
                </AdminTd>
                <AdminTd align="end">
                  <Link
                    href={`/admin/inventory/${row.productId}`}
                    className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {a.inventory.viewHistory}
                  </Link>
                </AdminTd>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminTable>
      )}
      <p className="text-xs text-[var(--muted)]">{a.inventory.reservedHint}</p>

      {goLiveAt ? (
        <AdminCard title={a.inventory.recentPurchases}>
          {purchases.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{a.inventory.noPurchases}</p>
          ) : (
            <ul className="space-y-3">
              {purchases.map((p) => (
                <li key={p.id} className="rounded-xl border border-[var(--admin-border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{p.supplier || "—"}</span>
                    <span className="text-xs text-[var(--muted)]">{formatDateAr(p.purchasedOn)}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {p.lines.map((l, i) => (
                      <li key={i} className="flex flex-wrap justify-between gap-2">
                        <span>
                          {l.productName} × <span dir="ltr">{l.quantity}</span>
                        </span>
                        <span className="text-[var(--muted)]" dir="ltr">
                          {formatMoney(l.unitCost, "MRU")} → {formatMoney(l.landedUnitCost, "MRU")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {p.extraCosts > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {a.inventory.extraCosts}: <span dir="ltr">{formatMoney(p.extraCosts, "MRU")}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      ) : null}
    </div>
  );
}
