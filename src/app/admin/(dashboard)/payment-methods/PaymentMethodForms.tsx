"use client";

import {
  createPaymentMethodAction,
  deletePaymentMethodAction,
  updatePaymentMethodAction,
} from "@/app/admin/(dashboard)/payment-methods/actions";
import { isValidPaymentLogoUrl } from "@/lib/payment-logo-url";
import type { PaymentMethodRow } from "@/types";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function PaymentLogoPreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  const trimmed = url.trim();
  useEffect(() => {
    setBroken(false);
  }, [trimmed]);
  const canTryImage = trimmed.length > 0 && isValidPaymentLogoUrl(trimmed);

  if (!trimmed) {
    return (
      <p className="mt-2 text-xs text-[var(--muted)]">
        {a.paymentMethods.logoPreview}: —
      </p>
    );
  }
  if (!canTryImage) {
    return (
      <p className="mt-2 text-xs text-red-600 dark:text-red-400">
        {a.paymentMethods.logoUrlInvalid}
      </p>
    );
  }
  if (broken) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--muted)]">{a.paymentMethods.logoPreview}</span>
        <div
          className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[var(--accent-muted)] bg-[var(--accent-muted)]/30 text-xs text-[var(--muted)]"
          aria-hidden
        >
          —
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--muted)]">{a.paymentMethods.logoPreview}</span>
      <img
        src={trimmed}
        alt=""
        className="h-14 w-14 rounded-lg border border-[var(--accent-muted)] bg-[var(--card)] object-contain p-1"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export function CreatePaymentMethodForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [paymentLogoUrl, setPaymentLogoUrl] = useState("");
  const [sort, setSort] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPaymentLogoUrl(paymentLogoUrl)) {
      alert(a.paymentMethods.logoUrlInvalid);
      return;
    }
    setBusy(true);
    try {
      await createPaymentMethodAction({
        label,
        account_number: number,
        payment_logo_url: paymentLogoUrl,
        sort_order: sort,
        active: true,
      });
      setLabel("");
      setNumber("");
      setPaymentLogoUrl("");
      setSort(0);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6"
    >
      <h2 className="text-lg font-semibold">{a.paymentMethods.addMethod}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium">{a.paymentMethods.label}</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={a.paymentMethods.placeholderLabel}
          />
        </div>
        <div>
          <label className="text-xs font-medium">{a.paymentMethods.accountNumber}</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-xs font-medium">{a.paymentMethods.sortOrder}</label>
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium">{a.paymentMethods.logoUrl}</label>
          <input
            type="url"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={paymentLogoUrl}
            onChange={(e) => setPaymentLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            dir="ltr"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{a.paymentMethods.logoUrlHint}</p>
          <PaymentLogoPreview url={paymentLogoUrl} />
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? a.paymentMethods.saving : a.paymentMethods.add}
      </button>
    </form>
  );
}

export function PaymentMethodEditor({ row }: { row: PaymentMethodRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [number, setNumber] = useState(row.account_number);
  const [paymentLogoUrl, setPaymentLogoUrl] = useState(row.payment_logo_url ?? "");
  const [sort, setSort] = useState(row.sort_order);
  const [active, setActive] = useState(row.active);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPaymentLogoUrl(paymentLogoUrl)) {
      alert(a.paymentMethods.logoUrlInvalid);
      return;
    }
    setBusy(true);
    try {
      await updatePaymentMethodAction(row.id, {
        label,
        account_number: number,
        payment_logo_url: paymentLogoUrl,
        sort_order: sort,
        active,
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(a.paymentMethods.deleteConfirm)) return;
    setBusy(true);
    try {
      await deletePaymentMethodAction(row.id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="flex flex-col gap-3 rounded-xl border border-[var(--accent-muted)] p-4 md:flex-row md:items-end"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-xs text-[var(--muted)]">{a.paymentMethods.label}</label>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">{a.paymentMethods.numberField}</label>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">{a.paymentMethods.sortOrder}</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
              value={sort}
              onChange={(e) => setSort(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <input
              id={`a-${row.id}`}
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor={`a-${row.id}`} className="text-sm">
              {a.paymentMethods.active}
            </label>
          </div>
        </div>
        <div className="max-w-xl">
          <label className="text-xs text-[var(--muted)]">{a.paymentMethods.logoUrl}</label>
          <input
            type="url"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
            value={paymentLogoUrl}
            onChange={(e) => setPaymentLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            dir="ltr"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-[var(--muted)]">{a.paymentMethods.logoUrlHint}</p>
          <PaymentLogoPreview url={paymentLogoUrl} />
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent-muted)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {a.paymentMethods.save}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
        >
          {a.paymentMethods.delete}
        </button>
      </div>
    </form>
  );
}
