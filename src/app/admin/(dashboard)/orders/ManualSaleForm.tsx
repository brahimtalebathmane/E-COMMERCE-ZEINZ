"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import { AdminButton, AdminInput, AdminSelect } from "@/components/admin/ui";
import {
  createManualSaleAction,
  listActiveProductsForManualSaleAction,
  type ManualSaleChannel,
  type ManualSaleProductOption,
} from "./actions";

type Props = {
  open: boolean;
  onClose: () => void;
};

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
};

function newLine(): DraftLine {
  return { key: crypto.randomUUID(), productId: "", quantity: "1" };
}

function unitPriceFor(product: ManualSaleProductOption | undefined): number {
  if (!product) return 0;
  return product.discountPrice ?? product.price;
}

export function ManualSaleForm({ open, onClose }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<ManualSaleProductOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [initialStatus, setInitialStatus] = useState<"pending" | "confirmed">("confirmed");
  const [channel, setChannel] = useState<ManualSaleChannel>("phone_call");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setPhone("");
    setLines([newLine()]);
    setInitialStatus("confirmed");
    setChannel("phone_call");
    setLoadError(false);
    setProducts(null);
    listActiveProductsForManualSaleAction()
      .then(setProducts)
      .catch(() => setLoadError(true));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const productMap = useMemo(() => {
    const map = new Map<string, ManualSaleProductOption>();
    for (const p of products ?? []) map.set(p.id, p);
    return map;
  }, [products]);

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return sum;
      return sum + unitPriceFor(productMap.get(line.productId)) * qty;
    }, 0);
  }, [lines, productMap]);

  if (!open || !mounted) return null;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  async function onSubmit() {
    if (submitting) return;

    const preparedLines = lines
      .filter((line) => line.productId)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }));

    if (preparedLines.length === 0) {
      toast.error(a.manualSale.noProducts);
      return;
    }
    if (preparedLines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 1)) {
      toast.error(a.orders.quantityInvalid);
      return;
    }

    setSubmitting(true);
    try {
      const res = await createManualSaleAction({
        customerName,
        phone,
        initialStatus,
        channel,
        lines: preparedLines,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(a.manualSale.success);
      const anyMetaFailed = res.orders.some((o) => o.metaPurchase?.state === "failed");
      if (anyMetaFailed) {
        toast.warning(a.manualSale.metaPurchaseFailedNote);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.manualSale.success);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="admin-shell fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      dir="rtl"
      lang="ar"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label={a.manualSale.close}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-elevated)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {a.manualSale.title}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.manualSale.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20"
          >
            {a.manualSale.close}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AdminInput
              label={a.manualSale.customerName}
              placeholder={a.manualSale.customerNamePlaceholder}
              value={customerName}
              disabled={submitting}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <AdminInput
              label={a.manualSale.phone}
              placeholder={a.manualSale.phonePlaceholder}
              dir="ltr"
              value={phone}
              disabled={submitting}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <span className="text-xs font-semibold text-[var(--foreground)]">
              {a.manualSale.product}
            </span>
            {loadError ? (
              <p className="text-sm text-red-400">{a.manualSale.loadProductsFailed}</p>
            ) : null}
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <AdminSelect
                  className="flex-1"
                  value={line.productId}
                  disabled={submitting || !products}
                  onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                >
                  <option value="">{a.manualSale.selectProduct}</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </AdminSelect>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  dir="ltr"
                  disabled={submitting}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className="admin-input w-20 shrink-0 text-center tabular-nums"
                />
                <button
                  type="button"
                  disabled={submitting || lines.length <= 1}
                  onClick={() => removeLine(line.key)}
                  className="min-h-[44px] shrink-0 rounded-xl border border-red-400/30 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {a.manualSale.removeLine}
                </button>
              </div>
            ))}
            <AdminButton type="button" variant="ghost" disabled={submitting} onClick={addLine}>
              {a.manualSale.addLine}
            </AdminButton>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--accent-muted)] bg-[var(--card)]/40 px-4 py-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {a.manualSale.total}
            </span>
            <span className="font-mono text-sm font-semibold" dir="ltr">
              {formatPrice(total)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {a.manualSale.channel}
              </span>
              <select
                disabled={submitting}
                value={channel}
                onChange={(e) => setChannel(e.target.value as ManualSaleChannel)}
                className="admin-input mt-1.5"
              >
                <option value="phone_call">{a.manualSale.channelPhoneCall}</option>
                <option value="other">{a.manualSale.channelOther}</option>
              </select>
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {a.manualSale.initialStatus}
              </span>
              <select
                disabled={submitting}
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as "pending" | "confirmed")}
                className="admin-input mt-1.5"
              >
                <option value="confirmed">{a.manualSale.statusConfirmed}</option>
                <option value="pending">{a.manualSale.statusPending}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <AdminButton
            type="button"
            variant="primary"
            className="w-full"
            disabled={submitting}
            onClick={() => void onSubmit()}
          >
            {submitting ? a.manualSale.submitting : a.manualSale.submit}
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
