"use client";

import {
  createPaymentMethodAction,
  deletePaymentMethodAction,
  updatePaymentMethodAction,
} from "@/app/admin/(dashboard)/payment-methods/actions";
import type { PaymentMethodRow } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreatePaymentMethodForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [sort, setSort] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createPaymentMethodAction({
        label,
        account_number: number,
        sort_order: sort,
        active: true,
      });
      setLabel("");
      setNumber("");
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
      <h2 className="text-lg font-semibold">Add method</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium">Label</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Bank transfer"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Account / number shown to buyer</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Sort order</label>
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Add"}
      </button>
    </form>
  );
}

export function PaymentMethodEditor({ row }: { row: PaymentMethodRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [number, setNumber] = useState(row.account_number);
  const [sort, setSort] = useState(row.sort_order);
  const [active, setActive] = useState(row.active);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePaymentMethodAction(row.id, {
        label,
        account_number: number,
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
    if (!confirm("Delete this payment method?")) return;
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
      <div className="grid flex-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <label className="text-xs text-[var(--muted)]">Label</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Number</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Sort</label>
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
            Active
          </label>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent-muted)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
