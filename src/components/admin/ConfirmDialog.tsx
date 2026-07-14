"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useState } from "react";
import { AdminButton } from "@/components/admin/ui";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Reusable in-app confirmation dialog. Native `window.confirm()` is silently
 * suppressed in some embedded/webview contexts (returns false / throws with no
 * visible error), which reads to a user as "the button does nothing" — this
 * component removes that entire failure class for any destructive/bulk action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="admin-shell fixed inset-0 z-[110] flex items-center justify-center p-4"
      dir="rtl"
      lang="ar"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-elevated)] p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)]"
      >
        <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AdminButton type="button" variant="ghost" className="sm:w-auto" onClick={onCancel}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            className="sm:w-auto"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
