"use client";

import { adminAr as a } from "@/locales/admin-ar";
import {
  AdminCard,
  AdminEmptyState,
  AdminKpiTile,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
} from "@/components/admin/ui";
import type { CtwaAdPerformance } from "./types";

const NUMBER_FORMATTER = new Intl.NumberFormat("ar", { maximumFractionDigits: 0 });

function formatCount(value: number): string {
  return NUMBER_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number, currency: string): string {
  const amount = NUMBER_FORMATTER.format(Number.isFinite(value) ? Math.round(value) : 0);
  return currency ? `${amount} ${currency}` : amount;
}

/** Conversations that became a non-cancelled order, as a percentage. */
function conversionRate(confirmed: number, conversations: number): string {
  if (conversations <= 0) return "—";
  return `${Math.round((confirmed / conversations) * 1000) / 10}%`;
}

type Props = {
  report: CtwaAdPerformance;
};

export function CtwaAdPerformanceSection({ report }: Props) {
  const overallRate = conversionRate(report.totalConfirmed, report.totalConversations);

  return (
    <AdminCard>
      <h2 className="admin-section-title">{a.meta.ctwaTitle}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {a.meta.ctwaSubtitle.replace("{days}", String(report.rangeDays))}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminKpiTile label={a.meta.ctwaConversations} value={formatCount(report.totalConversations)} />
        <AdminKpiTile label={a.meta.ctwaOrders} value={formatCount(report.totalOrders)} />
        <AdminKpiTile label={a.meta.ctwaConfirmed} value={formatCount(report.totalConfirmed)} />
        <AdminKpiTile
          label={a.meta.ctwaRevenue}
          value={formatMoney(report.totalRevenue, report.currency)}
          hint={`${a.meta.ctwaRate}: ${overallRate}`}
        />
      </div>

      {report.truncated ? (
        <p className="mt-3 text-xs text-amber-500">{a.meta.ctwaTruncated}</p>
      ) : null}

      {report.rows.length === 0 ? (
        <div className="mt-4">
          <AdminEmptyState title={a.meta.ctwaEmptyTitle} description={a.meta.ctwaEmptyBody} />
        </div>
      ) : (
        <div className="mt-4">
          <AdminTable>
            <AdminTableHead>
              <AdminTableRow>
                <AdminTh>{a.meta.ctwaColAd}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColConversations}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColOrders}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColConfirmed}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColCancelled}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColRate}</AdminTh>
                <AdminTh align="end">{a.meta.ctwaColRevenue}</AdminTh>
              </AdminTableRow>
            </AdminTableHead>
            <AdminTableBody>
              {report.rows.map((row) => (
                <AdminTableRow key={row.adSourceId}>
                  <AdminTd>
                    <span className="font-mono text-xs" dir="ltr">
                      {row.adSourceId}
                    </span>
                  </AdminTd>
                  <AdminTd align="end" mono>{formatCount(row.conversations)}</AdminTd>
                  <AdminTd align="end" mono>{formatCount(row.orders)}</AdminTd>
                  <AdminTd align="end" mono>{formatCount(row.confirmed)}</AdminTd>
                  <AdminTd align="end" mono>{formatCount(row.cancelled)}</AdminTd>
                  <AdminTd align="end" mono>{conversionRate(row.confirmed, row.conversations)}</AdminTd>
                  <AdminTd align="end" mono>{formatMoney(row.revenue, row.currency || report.currency)}</AdminTd>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </div>
      )}
    </AdminCard>
  );
}
