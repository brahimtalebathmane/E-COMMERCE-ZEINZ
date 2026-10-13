"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminButton, AdminInput } from "@/components/admin/ui";
import type { ChangeLine } from "@/lib/owner-edits/patch";

const t = a.owner;

type Step = "edit" | "confirm" | "delete" | "restore";

/**
 * Owner edit flow for one record: fields → "old → new" confirmation with an
 * optional reason → save. Also delete and restore, each confirmed. A bottom
 * sheet on the phone, a centred dialog on wider screens.
 */
export function OwnerEditSheet({
  open,
  title,
  onClose,
  children,
  deleted = false,
  hint,
  computeChanges,
  onSave,
  onDelete,
  onRestore,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** The form fields (controlled by the caller). Hidden for a deleted record. */
  children?: ReactNode;
  deleted?: boolean;
  hint?: string;
  /** Lines to confirm, or an error message to show instead. */
  computeChanges?: () => ChangeLine[] | string;
  onSave?: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete?: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRestore?: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(deleted ? "restore" : "edit");
  const [lines, setLines] = useState<ChangeLine[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) {
      setStep(deleted ? "restore" : "edit");
      setReason("");
      setLines([]);
    }
  }, [open, deleted]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open || !mounted) return null;

  function review() {
    const res = computeChanges?.() ?? [];
    if (typeof res === "string") {
      toast.error(res);
      return;
    }
    if (res.length === 0) {
      toast.message(t.noChanges);
      return;
    }
    setLines(res);
    setStep("confirm");
  }

  async function submit(fn: typeof onSave, done: string) {
    if (!fn || busy) return;
    setBusy(true);
    try {
      const res = await fn(reason);
      if (!res.ok) throw new Error(res.error);
      toast.success(done);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const reasonField = (
    <AdminInput label={t.reason} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
  );

  return createPortal(
    <div className="admin-shell fixed inset-0 z-[105] flex items-end justify-center sm:items-center sm:p-4" dir="rtl" lang="ar">
      <button
        type="button"
        aria-label={t.cancel}
        className="absolute inset-0 bg-[var(--overlay)]"
        onClick={() => (busy ? null : onClose())}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] bg-[var(--background)] shadow-[var(--admin-shadow-lg)] sm:max-w-lg sm:rounded-[22px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
          <button
            type="button"
            className="min-h-[44px] px-1 text-[17px] text-[var(--accent)] disabled:opacity-50"
            disabled={busy}
            onClick={() => (step === "confirm" ? setStep("edit") : onClose())}
          >
            {step === "confirm" ? t.back : t.cancel}
          </button>
          <p className="min-w-0 truncate text-[17px] font-semibold">
            {step === "delete" ? t.deleteTitle : step === "restore" ? t.restoreTitle : step === "confirm" ? t.confirmTitle : title}
          </p>
          <span className="w-12" aria-hidden />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {step === "edit" ? (
            <>
              {hint ? <p className="text-[13px] text-[var(--muted)]">{hint}</p> : null}
              <div className="space-y-3">{children}</div>
              <div className="flex flex-col gap-2 pt-2">
                <AdminButton className="min-h-[50px] text-[17px]" disabled={busy} onClick={review}>
                  {t.save}
                </AdminButton>
                {onDelete ? (
                  <AdminButton variant="danger" disabled={busy} onClick={() => setStep("delete")}>
                    {t.delete}
                  </AdminButton>
                ) : null}
              </div>
            </>
          ) : null}

          {step === "confirm" ? (
            <>
              <p className="text-[15px] text-[var(--muted)]">{t.confirmBody}</p>
              <ul className="divide-y divide-[var(--admin-border)] overflow-hidden rounded-[14px] bg-[var(--card)]">
                {lines.map((l) => (
                  <li key={l.label} className="flex flex-col gap-1 px-4 py-3">
                    <span className="text-[13px] text-[var(--muted)]">{l.label}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[15px]">
                      <span className="text-[var(--muted)] line-through">{l.from}</span>
                      <span aria-hidden>←</span>
                      <span className="font-semibold">{l.to}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {reasonField}
              <AdminButton className="min-h-[50px] w-full text-[17px]" disabled={busy} onClick={() => void submit(onSave, t.saved)}>
                {t.save}
              </AdminButton>
            </>
          ) : null}

          {step === "delete" ? (
            <>
              <p className="text-[15px] text-[var(--muted)]">{t.deleteBody}</p>
              {reasonField}
              <AdminButton variant="danger" className="w-full" disabled={busy} onClick={() => void submit(onDelete, t.deleted)}>
                {t.delete}
              </AdminButton>
            </>
          ) : null}

          {step === "restore" ? (
            <>
              <p className="text-[15px] text-[var(--muted)]">{t.restoreBody}</p>
              {reasonField}
              <AdminButton className="w-full" disabled={busy || !onRestore} onClick={() => void submit(onRestore, t.restored)}>
                {t.restore}
              </AdminButton>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
