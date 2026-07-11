"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { useMetaRealtime } from "@/hooks/useMetaRealtime";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminSelect,
  metaEventHue,
} from "@/components/admin/ui";
import { AdminInput } from "@/components/admin/ui/AdminInput";
import {
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
} from "@/components/admin/ui/AdminTable";
import type { MetaEventLogRow } from "./types";

const PAGE_SIZE = 50;

const OPS_TIME_ZONE = "Africa/Nouakchott";

const TIME_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: OPS_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : TIME_FORMATTER.format(date);
}

function stateLabel(state: string): string {
  if (state === "failed") return a.meta.stateFailed;
  if (state === "skipped") return a.meta.stateSkipped;
  return a.meta.stateSuccess;
}

type Props = {
  initialRows: MetaEventLogRow[];
  initialTotal: number;
  initialOrderFilter?: string;
};

export function MetaMonitoringView({
  initialRows,
  initialTotal,
  initialOrderFilter = "",
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [eventType, setEventType] = useState("all");
  const [state, setState] = useState("all");
  const [search, setSearch] = useState(initialOrderFilter);

  const { highlightedIds } = useMetaRealtime({ setRows, setTotal });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
          eventType,
          state,
        });
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`/api/admin/meta-events?${params.toString()}`);
        const json = (await res.json()) as {
          rows?: MetaEventLogRow[];
          total?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "fetch_failed");
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
        setPage(nextPage);
      } catch {
        // Keep current rows on transient errors.
      } finally {
        setLoading(false);
      }
    },
    [eventType, state, search],
  );

  const applyFilters = () => {
    setPage(1);
    void fetchPage(1);
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    void fetchPage(nextPage);
  };

  return (
    <AdminCard title={a.meta.logTitle} noPadding>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-2">
          <AdminSelect
            label={a.meta.filterAllTypes}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="!min-h-[40px] w-auto min-w-[10rem]"
          >
            <option value="all">{a.meta.filterAllTypes}</option>
            {Object.entries(a.meta.eventTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            label={a.meta.filterAllStates}
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="!min-h-[40px] w-auto min-w-[10rem]"
          >
            <option value="all">{a.meta.filterAllStates}</option>
            <option value="failed">{a.meta.stateFailed}</option>
            <option value="skipped">{a.meta.stateSkipped}</option>
            <option value="success">{a.meta.stateSuccess}</option>
          </AdminSelect>
          <div className="min-w-[12rem] flex-1">
            <AdminInput
              label={a.meta.searchPlaceholder}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <AdminButton onClick={applyFilters} disabled={loading} className="!min-h-[40px]">
            {loading ? a.common.loading : a.meta.applyFilters}
          </AdminButton>
        </div>

        <AdminTable>
          <AdminTableHead>
            <tr>
              <AdminTh>{a.meta.colTime}</AdminTh>
              <AdminTh>{a.meta.colType}</AdminTh>
              <AdminTh>{a.meta.colState}</AdminTh>
              <AdminTh>{a.meta.colReason}</AdminTh>
              <AdminTh>{a.meta.colOrder}</AdminTh>
              <AdminTh>{a.meta.colEventId}</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--muted)]">
                  {a.meta.noRows}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <AdminTableRow
                  key={row.id}
                  highlight={highlightedIds.has(row.id)}
                  className={highlightedIds.has(row.id) ? "!bg-sky-400/10" : ""}
                >
                  <AdminTd mono className="whitespace-nowrap">
                    <span dir="ltr">{formatTime(row.created_at)}</span>
                  </AdminTd>
                  <AdminTd>
                    {a.meta.eventTypes[row.event_type as keyof typeof a.meta.eventTypes] ??
                      row.event_type}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge hue={metaEventHue(row.state)} size="sm">
                      {stateLabel(row.state)}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd className="max-w-[10rem] truncate">
                    <span title={row.reason ?? ""}>{row.reason ?? "—"}</span>
                  </AdminTd>
                  <AdminTd>
                    {row.order_id ? (
                      <Link
                        href={`/admin/orders?highlight=${row.order_id}`}
                        className="font-mono text-xs text-[var(--accent)] hover:underline"
                        dir="ltr"
                      >
                        {row.order_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                  <AdminTd className="max-w-[8rem] truncate font-mono text-xs">
                    <span title={row.event_id ?? ""} dir="ltr">
                      {row.event_id ? (
                        <>
                          {row.event_id.slice(0, 16)}
                          {row.event_id.length > 16 ? "…" : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </AdminTd>
                </AdminTableRow>
              ))
            )}
          </AdminTableBody>
        </AdminTable>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-[var(--muted)]">{a.meta.pageInfo(page, totalPages, total)}</span>
          <div className="flex gap-2">
            <AdminButton
              variant="ghost"
              className="!min-h-[36px] !px-3 !text-xs"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              {a.meta.prevPage}
            </AdminButton>
            <AdminButton
              variant="ghost"
              className="!min-h-[36px] !px-3 !text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              {a.meta.nextPage}
            </AdminButton>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
