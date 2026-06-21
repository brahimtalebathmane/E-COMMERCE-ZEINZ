"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { OrderStatus } from "@/types";
import type { AdminOrderRow } from "./types";
import { OrderDetailModal } from "./OrderDetailModal";
import { adminAr as a } from "@/locales/admin-ar";
import { deleteOrderAction } from "./actions";

/**
 * How many rows are committed to the DOM on first paint, plus the size of each
 * follow-up chunk. Small datasets (the common case) render fully in one frame;
 * large order histories paint the first page instantly and then stream the rest
 * in idle frames so the main thread is never blocked.
 */
const INITIAL_RENDER = 30;
const RENDER_CHUNK = 30;

/**
 * Mauritania operates on Africa/Nouakchott (UTC+0, no DST). All day-boundary
 * calculations are pinned to this zone so the "Today / Yesterday" dividers
 * reflect the local operational day regardless of the admin's browser zone.
 */
const OPS_TIME_ZONE = "Africa/Nouakchott";

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: OPS_TIME_ZONE,
  dateStyle: "full",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: OPS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** Stable YYYY-MM-DD key for a date, evaluated in the operational time zone. */
function dayKey(date: Date): string {
  return DAY_KEY_FORMATTER.format(date);
}

const ALL_PRODUCTS = "__all__";

type ProductTab = {
  id: string;
  name: string;
  total: number;
  pending: number;
  confirmed: number;
  shipped: number;
  cancelled: number;
  needsAttention: number;
};

type DayGroup = {
  key: string;
  label: string;
  rows: AdminOrderRow[];
};

function emptyCounts() {
  return {
    total: 0,
    pending: 0,
    confirmed: 0,
    shipped: 0,
    cancelled: 0,
    needsAttention: 0,
  };
}

function tallyStatus(counts: ReturnType<typeof emptyCounts>, status: OrderStatus) {
  counts.total += 1;
  switch (status) {
    case "pending":
      counts.pending += 1;
      break;
    case "confirmed":
      counts.confirmed += 1;
      break;
    case "shipped":
      counts.shipped += 1;
      break;
    case "cancelled":
      counts.cancelled += 1;
      break;
    case "requires_human_intervention":
      counts.needsAttention += 1;
      break;
  }
}

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
    case "requires_human_intervention":
      return "border-violet-500/40 bg-violet-500/10 text-violet-900";
    default:
      return "border-[var(--accent-muted)] bg-[var(--card)] text-[var(--foreground)]";
  }
}

const OrderStatusBadge = memo(function OrderStatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}
    >
      {a.orderStatus[status]}
    </span>
  );
});

/** Compact metric pill used in the per-segment summary strip. */
function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pending" | "confirmed" | "shipped" | "cancelled" | "attention";
}) {
  const toneClass = {
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-900",
    confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
    shipped: "border-sky-500/40 bg-sky-500/10 text-sky-900",
    cancelled: "border-red-500/40 bg-red-500/10 text-red-900",
    attention: "border-violet-500/40 bg-violet-500/10 text-violet-900",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}
    >
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
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
  const [selectedProduct, setSelectedProduct] = useState<string>(ALL_PRODUCTS);
  const [renderCount, setRenderCount] = useState(() =>
    Math.min(INITIAL_RENDER, orders.length),
  );

  // Aggregate per-product metrics. Order of appearance mirrors `rows` (newest
  // first), so the most recently active products surface at the front.
  const productTabs = useMemo<ProductTab[]>(() => {
    const byId = new Map<string, ProductTab>();
    for (const row of rows) {
      let tab = byId.get(row.product_id);
      if (!tab) {
        tab = {
          id: row.product_id,
          name: row.products?.name_ar ?? a.orders.productUnknown,
          ...emptyCounts(),
        };
        byId.set(row.product_id, tab);
      }
      tallyStatus(tab, row.status);
    }
    return Array.from(byId.values());
  }, [rows]);

  // If the selected product disappears (e.g. last order deleted), fall back.
  useEffect(() => {
    if (
      selectedProduct !== ALL_PRODUCTS &&
      !productTabs.some((t) => t.id === selectedProduct)
    ) {
      setSelectedProduct(ALL_PRODUCTS);
    }
  }, [productTabs, selectedProduct]);

  const filteredRows = useMemo(
    () =>
      selectedProduct === ALL_PRODUCTS
        ? rows
        : rows.filter((r) => r.product_id === selectedProduct),
    [rows, selectedProduct],
  );

  const segmentCounts = useMemo(() => {
    if (selectedProduct === ALL_PRODUCTS) {
      const counts = emptyCounts();
      for (const row of rows) tallyStatus(counts, row.status);
      return counts;
    }
    const tab = productTabs.find((t) => t.id === selectedProduct);
    return tab ?? emptyCounts();
  }, [rows, productTabs, selectedProduct]);

  // Reset the progressive window whenever the active segment changes so a
  // freshly selected product paints its first page instantly.
  useEffect(() => {
    setRenderCount(Math.min(INITIAL_RENDER, filteredRows.length));
  }, [selectedProduct, filteredRows.length]);

  useEffect(() => {
    if (renderCount >= filteredRows.length) return;
    const id = requestAnimationFrame(() => {
      setRenderCount((c) => Math.min(filteredRows.length, c + RENDER_CHUNK));
    });
    return () => cancelAnimationFrame(id);
  }, [renderCount, filteredRows.length]);

  const visibleRows =
    filteredRows.length <= renderCount
      ? filteredRows
      : filteredRows.slice(0, renderCount);

  // Group the visible (already newest-first) rows by operational day. Insertion
  // order is preserved, so day sections and the rows inside them stay sorted
  // latest-first without any extra sort pass.
  const dayGroups = useMemo<DayGroup[]>(() => {
    const todayKey = dayKey(new Date());
    const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000));
    const map = new Map<string, AdminOrderRow[]>();
    for (const row of visibleRows) {
      const key = dayKey(new Date(row.created_at));
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => {
      const dateLabel = DAY_LABEL_FORMATTER.format(new Date(groupRows[0].created_at));
      let label = dateLabel;
      if (key === todayKey) label = `${a.orders.today} — ${dateLabel}`;
      else if (key === yesterdayKey) label = `${a.orders.yesterday} — ${dateLabel}`;
      return { key, label, rows: groupRows };
    });
  }, [visibleRows]);

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
      {/* Product isolation tabs */}
      <div className="mt-8">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          <ProductTabButton
            label={a.orders.allProducts}
            count={rows.length}
            active={selectedProduct === ALL_PRODUCTS}
            onClick={() => setSelectedProduct(ALL_PRODUCTS)}
          />
          {productTabs.map((tab) => (
            <ProductTabButton
              key={tab.id}
              label={tab.name}
              count={tab.total}
              active={selectedProduct === tab.id}
              onClick={() => setSelectedProduct(tab.id)}
            />
          ))}
        </div>

        {/* Aggregate metrics for the active segment */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)]/40 px-3 py-3">
          <span className="me-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {a.orders.segmentSummaryTitle}
          </span>
          <MetricPill label={a.orders.metricPending} value={segmentCounts.pending} tone="pending" />
          <MetricPill
            label={a.orders.metricConfirmed}
            value={segmentCounts.confirmed}
            tone="confirmed"
          />
          <MetricPill label={a.orders.metricShipped} value={segmentCounts.shipped} tone="shipped" />
          <MetricPill
            label={a.orders.metricCancelled}
            value={segmentCounts.cancelled}
            tone="cancelled"
          />
          {segmentCounts.needsAttention > 0 ? (
            <MetricPill
              label={a.orders.metricNeedsAttention}
              value={segmentCounts.needsAttention}
              tone="attention"
            />
          ) : null}
        </div>
      </div>

      {/* Day-by-day chronological sections */}
      <div className="mt-6 space-y-8">
        {dayGroups.map((group) => (
          <section key={group.key}>
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-3 bg-[var(--background)]/95 px-1 py-1 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  {group.label}
                </h2>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {group.rows.length} {a.orders.ordersCountLabel}
              </span>
              <span className="h-px flex-1 bg-[var(--accent-muted)]" />
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {group.rows.map((o) => (
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {a.orders.phone}
                          </p>
                          <p className="mt-0.5 break-all font-mono text-sm" dir="ltr">
                            {o.phone ?? "—"}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]" dir="ltr">
                          {TIME_FORMATTER.format(new Date(o.created_at))}
                        </span>
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

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-[var(--accent-muted)] md:block">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-[var(--card)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="w-[28%] px-4 py-3 text-start">{a.orders.phone}</th>
                    <th className="w-[48%] px-4 py-3 text-start">{a.orders.status}</th>
                    <th className="w-[12%] px-4 py-3 text-start">{a.orders.orderDate}</th>
                    <th className="w-[12%] px-4 py-3 text-start">{a.orders.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--accent-muted)]">
                  {group.rows.map((o) => (
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
                          <span className="text-xs text-[var(--muted)]">
                            {a.orders.openDetailHint}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="font-mono text-xs text-[var(--muted)]" dir="ltr">
                          {TIME_FORMATTER.format(new Date(o.created_at))}
                        </span>
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
          </section>
        ))}
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

function ProductTabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
          : "border-[var(--accent-muted)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent-muted)]/20"
      }`}
    >
      <span className="max-w-[14rem] truncate">{label}</span>
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${
          active ? "bg-white/20 text-white" : "bg-[var(--accent-muted)]/40 text-[var(--muted)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
