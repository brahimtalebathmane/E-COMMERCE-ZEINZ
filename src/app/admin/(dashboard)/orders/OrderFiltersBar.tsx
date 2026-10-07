"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";
import {
  EMPTY_ORDER_FILTERS,
  FILTER_STATUSES,
  OLDER_THAN_PRESETS,
  hasServerFilters,
  serializeOrderListFilters,
  type OrderListFilters,
} from "@/lib/orders/list-filters";

const f = a.orders.filters;

/**
 * Status / date / product / source filters. Every change navigates to the new
 * URL, so the server re-reads all orders of the country with the filters
 * applied (and a refresh keeps them). The text search is carried along.
 */
export function OrderFiltersBar({
  filters,
  search,
  products,
}: {
  filters: OrderListFilters;
  search: string;
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(patch: Partial<OrderListFilters>) {
    const next = { ...filters, ...patch, q: search };
    const qs = serializeOrderListFilters(next);
    startTransition(() => router.push(qs ? `/admin/orders?${qs}` : "/admin/orders", { scroll: false }));
  }

  function toggleStatus(status: OrderListFilters["statuses"][number]) {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : FILTER_STATUSES.filter((s) => s === status || filters.statuses.includes(s));
    apply({ statuses });
  }

  const chip = (active: boolean) =>
    `min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
      active
        ? "border-[var(--accent)] bg-[var(--accent-muted)]/30 text-[var(--foreground)]"
        : "border-[var(--admin-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
    }`;

  return (
    <div className="admin-card mt-4 space-y-3 px-3 py-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-xs font-semibold text-[var(--muted)]">{f.status}</span>
        {FILTER_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.statuses.includes(status)}
            disabled={pending}
            className={chip(filters.statuses.includes(status))}
            onClick={() => toggleStatus(status)}
          >
            {a.orderStatus[status]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{f.dateFrom}</span>
          <input
            type="date"
            dir="ltr"
            className="admin-input"
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            disabled={pending}
            onChange={(e) => apply({ from: e.target.value || null })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{f.dateTo}</span>
          <input
            type="date"
            dir="ltr"
            className="admin-input"
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            disabled={pending}
            onChange={(e) => apply({ to: e.target.value || null })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{f.product}</span>
          <select
            className="admin-input"
            value={filters.productId ?? ""}
            disabled={pending}
            onChange={(e) => apply({ productId: e.target.value || null })}
          >
            <option value="">{f.allProducts}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{f.source}</span>
          <select
            className="admin-input"
            value={filters.source ?? ""}
            disabled={pending}
            onChange={(e) => apply({ source: (e.target.value || null) as OrderListFilters["source"] })}
          >
            <option value="">{f.allSources}</option>
            <option value="manual">{f.sourceManual}</option>
            <option value="storefront">{f.sourceStorefront}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {OLDER_THAN_PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={filters.olderThanDays === days}
            disabled={pending}
            className={chip(filters.olderThanDays === days)}
            onClick={() => apply({ olderThanDays: filters.olderThanDays === days ? null : days })}
          >
            {f.olderThan.replace("{days}", String(days))}
          </button>
        ))}
        {hasServerFilters(filters) ? (
          <button
            type="button"
            disabled={pending}
            className="ms-auto text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
            onClick={() => apply({ ...EMPTY_ORDER_FILTERS })}
          >
            {f.clear}
          </button>
        ) : null}
        {pending ? <span className="text-xs text-[var(--muted)]">{f.applying}</span> : null}
      </div>
    </div>
  );
}
