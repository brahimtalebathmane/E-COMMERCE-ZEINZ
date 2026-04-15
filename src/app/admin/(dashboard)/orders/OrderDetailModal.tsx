"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { AdminOrderRow } from "./types";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import type { OrderStatus } from "@/types";
import { toast } from "sonner";

type Props = {
  order: AdminOrderRow | null;
  open: boolean;
  onClose: () => void;
  onDeleted: (orderId: string) => void;
  onOrderUpdated: (orderId: string, patch: Partial<Pick<AdminOrderRow, "status">>) => void;
};

export function OrderDetailModal({ order, open, onClose, onDeleted, onOrderUpdated }: Props) {
  const titleId = useId();
  const [draftStatus, setDraftStatus] = useState<OrderStatus>("pending");
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!order) return;
    setDraftStatus(order.status);
    setSaving(false);
  }, [order]);

  if (!open || !order) return null;
  const product = order.products;
  const created = new Date(order.created_at);
  const dateStr = new Intl.DateTimeFormat("ar", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(created);
  const currentOrder = order;
  const hasChanges = draftStatus !== order.status;

  async function onSaveChanges() {
    if (saveLockRef.current || saving || !hasChanges) return;
    saveLockRef.current = true;
    const prevStatus = currentOrder.status;

    onOrderUpdated(currentOrder.id, { status: draftStatus });
    setSaving(true);

    try {
      const res = await fetch(`/api/orders/${currentOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: draftStatus }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        order?: { status?: OrderStatus };
        error?: string;
        meta?: {
          purchase?: {
            state: "sent" | "skipped" | "failed";
            reason?: string;
          };
        };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || a.orders.saveFailed);
      }
      if (json.order?.status) {
        setDraftStatus(json.order.status);
        onOrderUpdated(currentOrder.id, { status: json.order.status });
      }
      const purchaseMeta = json.meta?.purchase;
      if (purchaseMeta?.state === "sent") {
        toast.success(a.orders.metaPurchaseCapiOk);
      } else if (purchaseMeta?.state === "failed") {
        toast.error(a.orders.metaPurchaseCapiFailed);
      } else if (
        purchaseMeta?.state === "skipped" &&
        purchaseMeta.reason === "missing_order_meta"
      ) {
        toast.warning(a.orders.metaPurchaseCapiMissingMeta);
      }
    } catch (error) {
      onOrderUpdated(currentOrder.id, { status: prevStatus });
      setDraftStatus(prevStatus);
      toast.error(error instanceof Error ? error.message : a.orders.saveFailed);
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label={a.orders.closeDetail}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--accent-muted)] bg-[var(--background)] shadow-xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {a.orders.orderDetailTitle}
            </h2>
            <p className="mt-1 break-all font-mono text-[11px] text-[var(--muted)]" dir="ltr">
              {order.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20"
          >
            {a.orders.closeDetail}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {a.orders.sectionMeta}
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[var(--muted)]">{a.orders.orderDate}</dt>
                  <dd className="break-words">{dateStr}</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[var(--muted)]">{a.orders.customer}</dt>
                  <dd className="break-words">{order.customer_name ?? "—"}</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[var(--muted)]">{a.orders.phone}</dt>
                  <dd className="break-all" dir="ltr">
                    {order.phone ?? "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {a.orders.sectionProduct}
              </h3>
              {product ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-medium text-[var(--foreground)]">{product.name_ar}</p>
                  <p className="text-[var(--muted)]">
                    <Link
                      href={`/${product.slug}`}
                      className="text-[var(--accent)] underline underline-offset-2 hover:opacity-90"
                    >
                      {a.orders.viewStoreProduct}
                    </Link>
                  </p>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--muted)]">{a.orders.productPrice}</dt>
                      <dd dir="ltr">{formatPrice(Number(product.price))}</dd>
                    </div>
                    {product.discount_price != null ? (
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-[var(--muted)]">{a.orders.productDiscount}</dt>
                        <dd dir="ltr">{formatPrice(Number(product.discount_price))}</dd>
                      </div>
                    ) : null}
                    <div className="text-xs text-[var(--muted)]">
                      {product.media_type === "video"
                        ? a.orders.mediaVideo
                        : a.orders.mediaImage}
                      :{" "}
                      <span className="break-all font-mono" dir="ltr">
                        {product.media_url}
                      </span>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted)]">—</p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {a.orders.sectionTotal}
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[var(--muted)]">{a.orders.total}</dt>
                  <dd dir="ltr">
                    {formatPrice(Number(order.total_price))}{" "}
                    <span className="text-[var(--muted)]">({order.currency})</span>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)]/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {a.orders.sectionActions}
              </h3>
              <div className="mt-3 flex flex-col gap-3">
                <select
                  disabled={saving}
                  className="min-h-[44px] w-full max-w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-60"
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value as OrderStatus)}
                >
                  <option value="pending">{a.orderStatus.pending}</option>
                  <option value="confirmed">{a.orderStatus.confirmed}</option>
                  <option value="shipped">{a.orderStatus.shipped}</option>
                  <option value="cancelled">{a.orderStatus.cancelled}</option>
                </select>
                <button
                  type="button"
                  disabled={saving || !hasChanges}
                  onClick={() => void onSaveChanges()}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? a.orders.savingChanges : a.orders.saveChanges}
                </button>
              </div>
              <div className="mt-3 border-t border-[var(--accent-muted)] pt-3">
                <button
                  type="button"
                  disabled={saving}
                  className="min-h-[44px] w-full rounded-xl border border-red-300 bg-[var(--card)] px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50/40 dark:border-red-800 dark:text-red-400"
                  onClick={() => onDeleted(order.id)}
                >
                  {a.orders.delete}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
