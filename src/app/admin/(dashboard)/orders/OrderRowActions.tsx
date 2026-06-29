"use client";

import type { OrderStatus } from "@/types";
import { adminAr as a } from "@/locales/admin-ar";
import { useAdminAccess } from "@/components/admin/AdminPermissionsContext";
import {
  canChangeOrderStatus,
  PERMISSIONS,
} from "@/lib/auth/permissions";
import { useMemo, useRef, useState } from "react";

type Props = {
  orderId: string;
  status: OrderStatus;
};

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "cancelled",
  "requires_human_intervention",
  "internal_return",
];

export function OrderRowActions({ orderId, status }: Props) {
  const access = useAdminAccess();
  const [busy, setBusy] = useState(false);
  // Synchronous lock so a rapid second status change cannot issue a duplicate
  // PATCH (and thus a duplicate Purchase/CancelledLead dispatch) before `busy`
  // re-renders the disabled control.
  const saveLockRef = useRef(false);

  const allowedStatuses = useMemo(() => {
    return ALL_STATUSES.filter((next) => canChangeOrderStatus(access, next));
  }, [access]);

  const canEdit = allowedStatuses.length > 0;

  async function onStatus(next: OrderStatus) {
    if (!canChangeOrderStatus(access, next)) return;
    if (saveLockRef.current || busy) return;
    saveLockRef.current = true;
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
      saveLockRef.current = false;
      setBusy(false);
    }
  }

  if (!access.isOwner && !access.permissions.includes(PERMISSIONS.view_orders)) {
    return null;
  }

  if (!canEdit) {
    return (
      <p className="text-xs text-[var(--muted)]">
        {a.orders.readOnlyStatus}: {a.orderStatus[status]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <select
        disabled={busy}
        className="min-h-[44px] w-full max-w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm"
        value={status}
        onChange={(e) => void onStatus(e.target.value as OrderStatus)}
      >
        {ALL_STATUSES.map((value) => {
          const allowed =
            value === status ||
            canChangeOrderStatus(access, value);
          if (!allowed && value !== status) return null;
          return (
            <option key={value} value={value} disabled={!allowed}>
              {a.orderStatus[value]}
            </option>
          );
        })}
      </select>
    </div>
  );
}
