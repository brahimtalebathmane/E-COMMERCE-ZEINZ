"use client";

import type { OrderStatus } from "@/types";
import { updateOrderStatusAction } from "@/app/admin/(dashboard)/orders/actions";
import { buildCompletionWhatsAppUrl } from "@/lib/whatsapp";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  orderId: string;
  completionToken: string;
  status: OrderStatus;
  formComplete: boolean;
  receiptPath: string | null;
};

export function OrderRowActions({
  orderId,
  completionToken,
  status,
  formComplete,
  receiptPath,
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

  const waUrl = buildCompletionWhatsAppUrl(orderId, completionToken);

  return (
    <div className="flex flex-col gap-2">
      <select
        disabled={busy}
        className="rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-2 py-1 text-xs"
        value={status}
        onChange={(e) => void onStatus(e.target.value as OrderStatus)}
      >
        <option value="pending">pending</option>
        <option value="confirmed">confirmed</option>
        <option value="shipped">shipped</option>
        <option value="cancelled">cancelled</option>
      </select>
      {!formComplete ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="text-center text-xs font-medium text-[var(--accent)] underline"
        >
          Send form link (WhatsApp)
        </a>
      ) : (
        <span className="text-xs text-[var(--muted)]">Form done</span>
      )}
      {receiptPath ? (
        <button
          type="button"
          disabled={busy}
          className="text-xs text-[var(--muted)] underline"
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch(
                `/api/admin/signed-url?path=${encodeURIComponent(receiptPath)}`,
              );
              const json = (await res.json()) as { signedUrl?: string; error?: string };
              if (!res.ok) {
                alert(json.error ?? "Could not sign URL");
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
          Preview receipt
        </button>
      ) : null}
    </div>
  );
}
