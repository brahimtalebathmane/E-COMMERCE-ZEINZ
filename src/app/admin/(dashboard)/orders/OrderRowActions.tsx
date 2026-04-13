"use client";

import type { OrderStatus } from "@/types";
import { adminAr as a } from "@/locales/admin-ar";
import { useState } from "react";

type Props = {
  orderId: string;
  status: OrderStatus;
};

export function OrderRowActions({
  orderId,
  status,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function onStatus(next: OrderStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Update failed");
      }
    } catch (e) {
      console.error("[OrderRowActions] status update failed", e);
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
    </div>
  );
}
