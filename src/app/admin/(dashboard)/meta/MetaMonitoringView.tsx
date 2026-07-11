"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { useMetaRealtime } from "@/hooks/useMetaRealtime";
import type { MetaEventLogRow, MetaOverviewStats } from "./types";

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

function stateBadgeClass(state: string): string {
  if (state === "success") return "bg-emerald-100 text-emerald-800";
  if (state === "failed") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

type Props = {
  initialRows: MetaEventLogRow[];
  initialTotal: number;
  overview: MetaOverviewStats;
  initialOrderFilter?: string;
};

export function MetaMonitoringView({
  initialRows,
  initialTotal,
  overview,
  initialOrderFilter = "",
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [eventType, setEventType] = useState("all");
  const [state, setState] = useState("all");
  const [search, setSearch] = useState(initialOrderFilter);
  const [healthStatus, setHealthStatus] = useState<{
    loading: boolean;
    ok: boolean | null;
    message: string | null;
  }>({ loading: false, ok: null, message: null });

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

  const checkHealth = async () => {
    setHealthStatus({ loading: true, ok: null, message: null });
    try {
      const res = await fetch("/api/meta/health");
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string | null;
        hints?: string[];
      };
      setHealthStatus({
        loading: false,
        ok: Boolean(json.ok),
        message: json.error ?? json.hints?.[0] ?? (json.ok ? a.meta.healthOk : a.meta.healthFail),
      });
    } catch {
      setHealthStatus({
        loading: false,
        ok: false,
        message: a.meta.healthFetchError,
      });
    }
  };

  const dispatchEventTypes = useMemo(
    () => ["lead", "purchase", "cancelled_lead", "initiate_checkout"],
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{a.meta.overviewTitle}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{a.meta.overviewSubtitle}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700">{a.meta.failures24h}</p>
            <p className="text-2xl font-semibold text-red-900">{overview.failures24h}</p>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">{a.meta.skips24h}</p>
            <p className="text-2xl font-semibold text-amber-900">{overview.skips24h}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700">{a.meta.successes24h}</p>
            <p className="text-2xl font-semibold text-emerald-900">{overview.successes24h}</p>
          </div>
          <div className="rounded-lg bg-orange-50 px-3 py-2">
            <p className="text-xs text-orange-700">{a.meta.stuckNow}</p>
            <p className="text-2xl font-semibold text-orange-900">{overview.stuckCount}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={healthStatus.loading}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-60"
          >
            {healthStatus.loading ? a.meta.checkingHealth : a.meta.checkHealth}
          </button>
          {healthStatus.ok != null && (
            <span
              className={`text-sm font-medium ${healthStatus.ok ? "text-emerald-700" : "text-red-700"}`}
            >
              {healthStatus.message}
            </span>
          )}
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">{a.meta.lastSuccessTitle}</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {dispatchEventTypes.map((type) => (
              <li key={type} className="flex justify-between gap-2 border-b border-[var(--border)] py-1">
                <span>{a.meta.eventTypes[type as keyof typeof a.meta.eventTypes] ?? type}</span>
                <span className="text-[var(--muted)]">
                  {formatTime(overview.lastSuccessByType[type])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{a.meta.logTitle}</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="all">{a.meta.filterAllTypes}</option>
            {Object.entries(a.meta.eventTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="all">{a.meta.filterAllStates}</option>
            <option value="failed">{a.meta.stateFailed}</option>
            <option value="skipped">{a.meta.stateSkipped}</option>
            <option value="success">{a.meta.stateSuccess}</option>
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={a.meta.searchPlaceholder}
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={applyFilters}
            disabled={loading}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? a.common.loading : a.meta.applyFilters}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-right text-[var(--muted)]">
                <th className="px-2 py-2 font-medium">{a.meta.colTime}</th>
                <th className="px-2 py-2 font-medium">{a.meta.colType}</th>
                <th className="px-2 py-2 font-medium">{a.meta.colState}</th>
                <th className="px-2 py-2 font-medium">{a.meta.colReason}</th>
                <th className="px-2 py-2 font-medium">{a.meta.colOrder}</th>
                <th className="px-2 py-2 font-medium">{a.meta.colEventId}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-[var(--muted)]">
                    {a.meta.noRows}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--border)] transition-colors ${
                      highlightedIds.has(row.id) ? "bg-sky-50" : ""
                    }`}
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{formatTime(row.created_at)}</td>
                    <td className="px-2 py-2">
                      {a.meta.eventTypes[row.event_type as keyof typeof a.meta.eventTypes] ??
                        row.event_type}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${stateBadgeClass(row.state)}`}
                      >
                        {row.state === "failed"
                          ? a.meta.stateFailed
                          : row.state === "skipped"
                            ? a.meta.stateSkipped
                            : a.meta.stateSuccess}
                      </span>
                    </td>
                    <td className="px-2 py-2 max-w-[10rem] truncate" title={row.reason ?? ""}>
                      {row.reason ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      {row.order_id ? (
                        <Link
                          href={`/admin/orders?highlight=${row.order_id}`}
                          className="text-[var(--primary)] hover:underline"
                        >
                          {row.order_id.slice(0, 8)}…
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 max-w-[8rem] truncate font-mono text-xs" title={row.event_id}>
                      {row.event_id.slice(0, 16)}
                      {row.event_id.length > 16 ? "…" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-[var(--muted)]">
            {a.meta.pageInfo(page, totalPages, total)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              {a.meta.prevPage}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              {a.meta.nextPage}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
