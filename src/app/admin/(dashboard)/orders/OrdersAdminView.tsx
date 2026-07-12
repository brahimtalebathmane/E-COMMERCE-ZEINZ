"use client";

import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { OrderStatus } from "@/types";
import type { AdminOrderRow } from "./types";
import { OrderDetailModal } from "./OrderDetailModal";
import { adminAr as a } from "@/locales/admin-ar";
import { deleteOrderAction, deleteOrdersAction } from "./actions";
import { useHasPermission } from "@/components/admin/AdminPermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import {
  AdminBadge,
  AdminMetricPill,
  AdminPageHeader,
  orderStatusHue,
} from "@/components/admin/ui";

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

/**
 * Parse a DB timestamp into a valid `Date`, or `null` when it is missing or
 * unparseable. Centralizing this keeps `Intl` formatters from throwing
 * `RangeError: Invalid time value` mid-render — a throw there crashes the whole
 * orders panel and leaves it stuck on the loading skeleton.
 */
function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Stable YYYY-MM-DD key for a date, evaluated in the operational time zone. */
function dayKey(date: Date): string {
  return DAY_KEY_FORMATTER.format(date);
}

const UNKNOWN_DAY_KEY = "__unknown__";

/** `dayKey` for a raw DB value, with a safe bucket for invalid dates. */
function rowDayKey(value: string | null | undefined): string {
  const date = safeDate(value);
  return date ? dayKey(date) : UNKNOWN_DAY_KEY;
}

/** Format a row time for display, never throwing on bad input. */
function formatRowTime(value: string | null | undefined): string {
  const date = safeDate(value);
  return date ? TIME_FORMATTER.format(date) : "—";
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
  internalReturn: number;
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
    internalReturn: 0,
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
    case "internal_return":
      counts.internalReturn += 1;
      break;
  }
}


const OrderStatusBadge = memo(function OrderStatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  return (
    <AdminBadge hue={orderStatusHue(status)}>
      {a.orderStatus[status]}
    </AdminBadge>
  );
});

const NewOrderBadge = memo(function NewOrderBadge() {
  return (
    <AdminBadge hue="emerald" size="sm">
      {a.orders.newOrderBadge}
    </AdminBadge>
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
  tone:
    | "pending"
    | "confirmed"
    | "shipped"
    | "cancelled"
    | "attention"
    | "return";
}) {
  const hueMap = {
    pending: "amber",
    confirmed: "emerald",
    shipped: "sky",
    cancelled: "red",
    attention: "violet",
    return: "slate",
  } as const;
  return <AdminMetricPill label={label} value={value} hue={hueMap[tone]} />;
}

type Props = {
  orders: AdminOrderRow[];
};

export function OrdersAdminView({ orders }: Props) {
  const canDeleteOrders = useHasPermission(PERMISSIONS.cancel_orders);
  const [rows, setRows] = useState<AdminOrderRow[]>(orders);
  const [active, setActive] = useState<AdminOrderRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<string>(ALL_PRODUCTS);
  const [renderCount, setRenderCount] = useState(() =>
    Math.min(INITIAL_RENDER, orders.length),
  );

  const { highlightedIds, trackRows } = useOrdersRealtime({ setRows, setActive });

  useEffect(() => {
    trackRows(rows);
  }, [rows, trackRows]);

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

  const selectedCount = selectedIds.size;
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
  const someFilteredSelected = filteredRows.some((row) => selectedIds.has(row.id));
  const deleteBusy = deletingId !== null || bulkDeleting;

  // Reset the progressive window whenever the active segment changes so a
  // freshly selected product paints its first page instantly.
  useEffect(() => {
    setRenderCount(Math.min(INITIAL_RENDER, filteredRows.length));
  }, [selectedProduct, filteredRows.length]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedProduct]);

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

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
      const key = rowDayKey(row.created_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => {
      if (key === UNKNOWN_DAY_KEY) {
        return { key, label: a.common.invalidDate, rows: groupRows };
      }
      const groupDate = safeDate(groupRows[0].created_at);
      const dateLabel = groupDate ? DAY_LABEL_FORMATTER.format(groupDate) : a.common.invalidDate;
      let label = dateLabel;
      if (key === todayKey) label = `${a.orders.today} — ${dateLabel}`;
      else if (key === yesterdayKey) label = `${a.orders.yesterday} — ${dateLabel}`;
      return { key, label, rows: groupRows };
    });
  }, [visibleRows]);

  function patchOrder(
    orderId: string,
    patch: Partial<
      Pick<AdminOrderRow, "status" | "meta_lead_sent" | "meta_purchase_sent" | "meta_cancel_sent">
    >,
  ) {
    setRows((prev) => prev.map((row) => (row.id === orderId ? { ...row, ...patch } : row)));
    setActive((prev) => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
  }

  function toggleSelected(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of filteredRows) next.delete(row.id);
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of filteredRows) next.add(row.id);
      return next;
    });
  }

  async function onDelete(orderId: string) {
    if (deleteBusy) return;
    if (!confirm(a.orders.deleteConfirm)) return;
    setDeletingId(orderId);
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== orderId));
    setActive((cur) => (cur?.id === orderId ? null : cur));
    setSelectedIds((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    try {
      await deleteOrderAction(orderId);
    } catch (e) {
      setRows(prev);
      toast.error(e instanceof Error ? e.message : a.orders.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }

  async function onDeleteSelected() {
    if (deleteBusy || selectedCount === 0) return;
    const ids = [...selectedIds];
    const confirmMessage = a.orders.deleteBulkConfirm.replace(
      "{count}",
      String(ids.length),
    );
    if (!confirm(confirmMessage)) return;

    setBulkDeleting(true);
    const prev = rows;
    const idSet = new Set(ids);
    setRows((r) => r.filter((x) => !idSet.has(x.id)));
    setActive((cur) => (cur && idSet.has(cur.id) ? null : cur));
    setSelectedIds(new Set());
    try {
      await deleteOrdersAction(ids);
    } catch (e) {
      setRows(prev);
      toast.error(e instanceof Error ? e.message : a.orders.deleteFailed);
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <>
      <AdminPageHeader title={a.orders.title} subtitle={a.orders.subtitle} />

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{a.orders.noOrdersHint}</p>
      ) : null}

      {/* Product isolation tabs */}
      {rows.length > 0 ? (
      <div className="mt-6">
        <div className="admin-scroll-fade relative -mx-1">
          <div className="flex gap-2 overflow-x-auto scroll-smooth px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        </div>

        {/* Aggregate metrics for the active segment */}
        <div className="admin-card mt-3 flex flex-wrap items-center gap-2 px-3 py-3">
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
          {segmentCounts.internalReturn > 0 ? (
            <MetricPill
              label={a.orders.metricInternalReturn}
              value={segmentCounts.internalReturn}
              tone="return"
            />
          ) : null}
        </div>
      </div>
      ) : null}

      {canDeleteOrders && rows.length > 0 ? (
        <div className="sticky top-14 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <OrderSelectCheckbox
              ref={selectAllRef}
              checked={allFilteredSelected}
              disabled={deleteBusy || filteredRows.length === 0}
              ariaLabel={allFilteredSelected ? a.orders.deselectAll : a.orders.selectAll}
              onChange={toggleSelectAllFiltered}
            />
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {selectedCount > 0
                ? a.orders.selectedCountLabel.replace("{count}", String(selectedCount))
                : a.orders.selectAll}
            </span>
          </div>
          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                className="min-h-[40px] rounded-lg border border-[var(--admin-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white/[0.04] disabled:opacity-60"
                onClick={() => setSelectedIds(new Set())}
              >
                {a.orders.deselectAll}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                className="min-h-[40px] rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/20 disabled:opacity-60"
                onClick={() => void onDeleteSelected().catch(() => {})}
              >
                {bulkDeleting ? a.orders.deletingBulk : a.orders.deleteSelected}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Day-by-day chronological sections */}
      {rows.length > 0 ? (
      <div className="mt-6 space-y-8">
        {dayGroups.map((group) => (
          <section key={group.key}>
            <div className="sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-3 bg-[var(--background)]/95 px-1 py-1 backdrop-blur">
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
              {group.rows.map((o) => {
                const isNew = highlightedIds.has(o.id);
                return (
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
                  className={`admin-card w-full cursor-pointer p-4 text-start transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]${isNew ? " admin-order-row-new" : ""}`}
                >
                  <div className="flex gap-4">
                    {canDeleteOrders ? (
                      <div
                        className="flex shrink-0 items-start pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <OrderSelectCheckbox
                          checked={selectedIds.has(o.id)}
                          disabled={deleteBusy}
                          ariaLabel={a.orders.selectAll}
                          onChange={() => toggleSelected(o.id)}
                        />
                      </div>
                    ) : null}
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
                        <div className="flex shrink-0 items-center gap-2">
                          {isNew ? <NewOrderBadge /> : null}
                          <span className="font-mono text-[11px] text-[var(--muted)]" dir="ltr">
                            {formatRowTime(o.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <OrderStatusBadge status={o.status} />
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-[var(--accent)]">
                            {a.orders.tapForDetails}
                          </span>
                          {canDeleteOrders ? (
                          <button
                            type="button"
                            disabled={deleteBusy && deletingId === o.id}
                            className="min-h-[40px] rounded-lg border border-red-400/40 bg-red-400/5 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/15 disabled:opacity-60"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void onDelete(o.id).catch(() => {});
                            }}
                          >
                            {deletingId === o.id ? a.orders.deleting : a.orderActions.delete}
                          </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Desktop table */}
            <div className="admin-card hidden overflow-hidden md:block">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    {canDeleteOrders ? <th className="w-[4%] px-3 py-3" aria-hidden /> : null}
                    <th className="w-[26%] px-4 py-3 text-start">{a.orders.phone}</th>
                    <th className="w-[44%] px-4 py-3 text-start">{a.orders.status}</th>
                    <th className="w-[12%] px-4 py-3 text-start">{a.orders.orderDate}</th>
                    <th className="w-[14%] px-4 py-3 text-start">{a.orders.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  {group.rows.map((o) => {
                    const isNew = highlightedIds.has(o.id);
                    return (
                    <tr
                      key={o.id}
                      tabIndex={0}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]${isNew ? " admin-order-row-new" : ""}`}
                      onClick={() => setActive(o)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActive(o);
                        }
                      }}
                    >
                      {canDeleteOrders ? (
                        <td
                          className="px-3 py-4 align-middle text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <OrderSelectCheckbox
                            checked={selectedIds.has(o.id)}
                            disabled={deleteBusy}
                            ariaLabel={a.orders.selectAll}
                            onChange={() => toggleSelected(o.id)}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-mono text-sm" dir="ltr">
                            {o.phone ?? "—"}
                          </span>
                          {isNew ? <NewOrderBadge /> : null}
                        </div>
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
                          {formatRowTime(o.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        {canDeleteOrders ? (
                        <button
                          type="button"
                          disabled={deleteBusy && deletingId === o.id}
                          className="min-h-[40px] rounded-xl border border-red-400/40 bg-red-400/5 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/15 disabled:opacity-60"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onDelete(o.id).catch(() => {});
                          }}
                        >
                          {deletingId === o.id ? a.orders.deleting : a.orderActions.delete}
                        </button>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      ) : null}

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

const OrderSelectCheckbox = memo(
  forwardRef<
    HTMLInputElement,
    {
      checked: boolean;
      disabled?: boolean;
      ariaLabel: string;
      onChange: () => void;
    }
  >(function OrderSelectCheckbox({ checked, disabled, ariaLabel, onChange }, ref) {
    return (
      <label className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation cursor-pointer items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border-[var(--admin-border-strong)] accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onChange();
          }}
        />
      </label>
    );
  }),
);

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
      className={`admin-tab-pill ${active ? "" : ""}`}
      data-active={active}
    >
      <span className="max-w-[14rem] truncate">{label}</span>
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${
          active ? "bg-white/20 text-white" : "bg-white/[0.06] text-[var(--muted)]"
        }`}
        dir="ltr"
      >
        {count}
      </span>
    </button>
  );
}
