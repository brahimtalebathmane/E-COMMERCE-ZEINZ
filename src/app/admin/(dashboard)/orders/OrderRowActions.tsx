"use client";

import type { OrderStatus } from "@/types";
import { updateOrderStatusAction } from "@/app/admin/(dashboard)/orders/actions";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  orderId: string;
  status: OrderStatus;
  formComplete: boolean;
};

export function OrderRowActions({
  orderId,
  status,
  formComplete,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onStatus(next: OrderStatus) {
    setBusy(true);
    try {
      await updateOrderStatusAction(orderId, next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <select
        disabled={busy}
        className="min-h-[44px] w-full max-w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm"
        value={status}
        onChange={(e) => void onStatus(e.target.value as OrderStatus)}
      >
        <option value="pending">{a.orderStatus.pending}</option>
        <option value="confirmed">{a.orderStatus.confirmed}</option>
        <option value="shipped">{a.orderStatus.shipped}</option>
        <option value="cancelled">{a.orderStatus.cancelled}</option>
      </select>
      <span className="text-sm text-[var(--muted)]">
        {formComplete ? a.orderActions.formDone : a.orderActions.formPending}
      </span>
    </div>
  );
}
