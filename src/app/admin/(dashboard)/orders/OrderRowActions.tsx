"use client";

import type { OrderStatus } from "@/types";
import { updateOrderStatusAction } from "@/app/admin/(dashboard)/orders/actions";
import {
  buildCompletionWhatsAppUrl,
  resolveOrderWhatsAppE164Digits,
} from "@/lib/whatsapp";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  orderId: string;
  completionToken: string;
  totalPrice: number;
  status: OrderStatus;
  formComplete: boolean;
  receiptPath: string | null;
  /** Product-specific WhatsApp; combined with env fallback inside buildCompletionWhatsAppUrl. */
  orderWhatsAppE164: string | null;
};

export function OrderRowActions({
  orderId,
  completionToken,
  totalPrice,
  status,
  formComplete,
  receiptPath,
  orderWhatsAppE164,
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

  const waDigits = resolveOrderWhatsAppE164Digits({
    whatsapp_e164: orderWhatsAppE164,
  });
  const waUrl = buildCompletionWhatsAppUrl(
    orderId,
    completionToken,
    waDigits || null,
    totalPrice,
  );

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
      {!formComplete ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-3 text-center text-sm font-medium text-[var(--accent)] underline-offset-2 transition hover:bg-[var(--accent-muted)]/15"
        >
          {a.orderActions.sendFormLink}
        </a>
      ) : (
        <span className="text-sm text-[var(--muted)]">{a.orderActions.formDone}</span>
      )}
      {receiptPath ? (
        <button
          type="button"
          disabled={busy}
          className="min-h-[44px] text-sm text-[var(--muted)] underline underline-offset-2"
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch(
                `/api/admin/signed-url?path=${encodeURIComponent(receiptPath)}`,
              );
              const json = (await res.json()) as { signedUrl?: string; error?: string };
              if (!res.ok) {
                alert(json.error ?? a.orderActions.signUrlFailed);
                return;
              }
              if (json.signedUrl) {
                window.open(json.signedUrl, "_blank", "noopener,noreferrer");
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {a.orderActions.previewReceipt}
        </button>
      ) : null}
    </div>
  );
}
