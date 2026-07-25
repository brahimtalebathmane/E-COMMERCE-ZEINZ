"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AdminCard, AdminButton, AdminBadge, AdminInput } from "@/components/admin/ui";
import { formatMoney } from "@/lib/currency";
import { finalizeAffiliateCostsAction, retryAffiliateSheetWriteAction } from "./actions";
import type { AdminOrderRow } from "./types";

export type SheetFailureRow = {
  orderId: string;
  customerName: string | null;
  productName: string;
  detail: string | null;
};

type Props = {
  awaitingCosts: AdminOrderRow[];
  sheetFailures: SheetFailureRow[];
};

/**
 * Additive panels shown above the main orders table: set_price affiliate
 * orders that are shipped but not yet counted in profit (awaiting
 * COD Partner's other costs), and affiliate orders whose Google Sheet
 * write failed. Kept separate from OrdersAdminView to avoid touching its
 * existing filtering/table logic.
 */
export function AffiliateAdminPanels({ awaitingCosts, sheetFailures }: Props) {
  if (awaitingCosts.length === 0 && sheetFailures.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {awaitingCosts.length > 0 ? (
        <AdminCard title={`طلبات تابعة بانتظار التكاليف (${awaitingCosts.length})`}>
          <p className="mb-3 text-xs text-[var(--admin-muted)]">
            طلبات شُحنت لكنها لن تُحتسب ضمن الأرباح حتى تُدخل التكاليف الإضافية التي أبلغ بها COD
            Partner.
          </p>
          <div className="space-y-2">
            {awaitingCosts.map((order) => (
              <AwaitingCostRow key={order.id} order={order} />
            ))}
          </div>
        </AdminCard>
      ) : null}

      {sheetFailures.length > 0 ? (
        <AdminCard title={`تعذّر إرسال طلبات إلى Google Sheet (${sheetFailures.length})`}>
          <p className="mb-3 text-xs text-[var(--admin-muted)]">
            الطلب محفوظ في النظام، لكن إرساله إلى شيت COD Partner فشل. أعد المحاولة بعد التأكد من
            رابط الشيت وصلاحيات الوصول.
          </p>
          <div className="space-y-2">
            {sheetFailures.map((row) => (
              <SheetFailureRowItem key={row.orderId} row={row} />
            ))}
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}

function AwaitingCostRow({ order }: { order: AdminOrderRow }) {
  const [otherCosts, setOtherCosts] = useState("");
  const [busy, setBusy] = useState(false);
  const currency = order.currency;

  async function finalize() {
    const n = Number.parseFloat(otherCosts);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("أدخل قيمة صالحة للتكاليف الإضافية.");
      return;
    }
    setBusy(true);
    try {
      const result = await finalizeAffiliateCostsAction(order.id, n);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم تثبيت التكاليف واحتساب الربح.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">
          {order.products?.name_ar ?? "—"} — {order.customer_name ?? "—"}
        </p>
        <p className="text-xs text-[var(--admin-muted)]">
          {formatMoney(order.total_price, currency)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <AdminInput
          type="number"
          step="0.01"
          min="0"
          placeholder={`التكاليف الإضافية (${currency})`}
          value={otherCosts}
          onChange={(e) => setOtherCosts(e.target.value)}
          disabled={busy}
          className="w-40"
        />
        <AdminButton onClick={() => void finalize()} disabled={busy} variant="primary">
          تثبيت
        </AdminButton>
      </div>
    </div>
  );
}

function SheetFailureRowItem({ row }: { row: SheetFailureRow }) {
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const result = await retryAffiliateSheetWriteAction(row.orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم إرسال الطلب إلى الشيت بنجاح.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">
          {row.productName} — {row.customerName ?? "—"}
        </p>
        {row.detail ? (
          <p className="truncate text-xs text-[var(--admin-muted)]" dir="ltr">
            {row.detail}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <AdminBadge hue="red">فشل الإرسال</AdminBadge>
        <AdminButton onClick={() => void retry()} disabled={busy} variant="ghost">
          إعادة المحاولة
        </AdminButton>
      </div>
    </div>
  );
}
