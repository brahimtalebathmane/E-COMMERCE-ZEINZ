"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { AdminInput, AdminSelect } from "@/components/admin/ui";
import { OwnerEditSheet } from "@/components/admin/OwnerEditSheet";
import { describeChanges, diffFields, TRANSACTION_KINDS, type TransactionPatch } from "@/lib/owner-edits/patch";
import type { TreasuryAccount, TreasuryCategory, TreasuryParty, TreasuryTransaction } from "@/lib/treasury/data";
import {
  ownerSetTransactionDeletedAction,
  ownerUpdateTransactionAction,
  ownerUpdateTransferAction,
} from "../owner/actions";

const t = a.owner;
const f = a.owner.fields;

export type OwnerTreasuryOptions = {
  accounts: TreasuryAccount[];
  categories: TreasuryCategory[];
  parties: TreasuryParty[];
};

type Form = {
  amount: string;
  occurred_on: string;
  account_id: string;
  category_id: string;
  party_id: string;
  note: string;
  kind: string;
  order_id: string;
  order_role: string;
  removeReceipt: boolean;
};

/** Owner edit of one treasury transaction (or a whole transfer). */
export function OwnerTransactionEditor({
  txn,
  rows,
  options,
  onClose,
}: {
  txn: TreasuryTransaction;
  /** Rows on screen: used to find the other side of a transfer. */
  rows: TreasuryTransaction[];
  options: OwnerTreasuryOptions;
  onClose: () => void;
}) {
  const router = useRouter();
  const isTransfer = Boolean(txn.transferGroupId) && !txn.reversesId;
  const otherLeg = isTransfer ? rows.find((r) => r.transferGroupId === txn.transferGroupId && r.id !== txn.id) : undefined;
  const category = options.categories.find((c) => c.id === txn.categoryId);
  const signed = category?.direction === "adjustment";

  const initial: Form = useMemo(
    () => ({
      amount: String(signed ? txn.amount : Math.abs(txn.amount)),
      occurred_on: txn.occurredOn,
      account_id: txn.accountId,
      category_id: txn.categoryId,
      party_id: txn.partyId ?? "",
      note: txn.note ?? "",
      kind: txn.kind,
      order_id: txn.orderId ?? "",
      order_role: txn.orderRole ?? "sale",
      removeReceipt: false,
    }),
    [txn, signed],
  );
  const [form, setForm] = useState<Form>(initial);
  const [newReceipt, setNewReceipt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Same private upload as quick add (manage_treasury; the owner has it).
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/treasury/receipt", { method: "POST", body, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !json.path) throw new Error(json.error || "upload failed");
      setNewReceipt(json.path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  const fromId = txn.amount < 0 ? txn.accountId : otherLeg?.accountId ?? "";
  const toId = txn.amount < 0 ? otherLeg?.accountId ?? "" : txn.accountId;
  const [transfer, setTransfer] = useState({
    amount: String(Math.abs(txn.amount)),
    occurred_on: txn.occurredOn,
    from: fromId,
    to: toId,
    note: txn.note ?? "",
  });

  const accountName = (id: string) => options.accounts.find((x) => x.id === id)?.name ?? t.none;
  const categoryName = (id: string) => options.categories.find((x) => x.id === id)?.name ?? t.none;
  const partyName = (id: string) => options.parties.find((x) => x.id === id)?.name ?? t.none;
  const set = (patch: Partial<Form>) => setForm((cur) => ({ ...cur, ...patch }));

  function patchFromForm(): TransactionPatch | string {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount === 0) return a.owner.fields.amount + ": 0";
    const changed = diffFields(initial, form);
    const patch: TransactionPatch = {};
    if ("amount" in changed) patch.amount = amount;
    if ("occurred_on" in changed) patch.occurred_on = form.occurred_on;
    if ("account_id" in changed) patch.account_id = form.account_id;
    if ("category_id" in changed) {
      patch.category_id = form.category_id;
      patch.amount = amount; // re-signed by the new category
    }
    if ("party_id" in changed) patch.party_id = form.party_id || null;
    if ("note" in changed) patch.note = form.note;
    if ("kind" in changed) patch.kind = form.kind as TransactionPatch["kind"];
    if ("order_id" in changed || ("order_role" in changed && form.order_id)) {
      patch.order_id = form.order_id.trim() || null;
      patch.order_role = form.order_id.trim() ? (form.order_role as "sale" | "delivery_fee") : null;
    }
    if (newReceipt) patch.receipt_path = newReceipt;
    else if (form.removeReceipt) patch.receipt_path = null;
    return patch;
  }

  function computeChanges() {
    if (isTransfer) {
      const before = { amount: String(Math.abs(txn.amount)), occurred_on: txn.occurredOn, from: fromId, to: toId, note: txn.note ?? "" };
      const changes = diffFields(before, transfer);
      return describeChanges(before, changes, { amount: f.amount, occurred_on: f.date, from: f.fromAccount, to: f.toAccount, note: f.note }, (k, v) =>
        k === "from" || k === "to" ? accountName(String(v ?? "")) : v == null || v === "" ? t.none : String(v),
      );
    }
    const patch = patchFromForm();
    if (typeof patch === "string") return patch;
    const before: Record<string, unknown> = {
      amount: txn.amount,
      occurred_on: txn.occurredOn,
      account_id: txn.accountId,
      category_id: txn.categoryId,
      party_id: txn.partyId,
      note: txn.note,
      kind: txn.kind,
      order_id: txn.orderId,
      order_role: txn.orderRole,
      receipt_path: txn.receiptPath ? f.receipt : null,
    };
    if ("receipt_path" in patch && patch.receipt_path) patch.receipt_path = t.replaceReceipt;
    const shown: Record<string, unknown> = { ...patch };
    if ("amount" in patch && !signed && !("category_id" in patch)) {
      shown.amount = txn.amount < 0 ? -Math.abs(Number(patch.amount)) : Math.abs(Number(patch.amount));
    }
    return describeChanges(
      before,
      shown,
      {
        amount: f.amount,
        occurred_on: f.date,
        account_id: f.account,
        category_id: f.category,
        party_id: f.party,
        note: f.note,
        kind: f.kind,
        order_id: f.orderId,
        order_role: f.orderRole,
        receipt_path: f.receipt,
      },
      (k, v) => {
        if (v == null || v === "") return t.none;
        if (k === "amount") return formatMoney(Number(v), "MRU");
        if (k === "account_id") return accountName(String(v));
        if (k === "category_id") return categoryName(String(v));
        if (k === "party_id") return partyName(String(v));
        if (k === "kind") return a.treasury.kinds[v as keyof typeof a.treasury.kinds] || String(v);
        if (k === "order_role") return t.orderRoles[v as "sale" | "delivery_fee"] ?? String(v);
        if (k === "order_id") return `#${String(v).slice(0, 8)}`;
        return String(v);
      },
    );
  }

  async function save(reason: string) {
    const res = isTransfer
      ? await ownerUpdateTransferAction({
          groupId: txn.transferGroupId!,
          amount: Number(transfer.amount),
          occurredOn: transfer.occurred_on,
          fromAccountId: transfer.from,
          toAccountId: transfer.to,
          note: transfer.note,
          reason,
        })
      : await (async () => {
          const patch = patchFromForm();
          if (typeof patch === "string") return { ok: false as const, error: patch };
          return ownerUpdateTransactionAction(txn.id, patch, reason);
        })();
    if (res.ok) router.refresh();
    return res;
  }

  async function setDeleted(deleted: boolean, reason: string) {
    const res = await ownerSetTransactionDeletedAction(txn.id, deleted, reason);
    if (res.ok) router.refresh();
    return res;
  }

  const accountOptions = options.accounts.map((acc) => (
    <option key={acc.id} value={acc.id}>
      {acc.name}
    </option>
  ));

  return (
    <OwnerEditSheet
      open
      title={`${t.edit} · ${txn.categoryName}`}
      onClose={onClose}
      deleted={Boolean(txn.deletedAt)}
      hint={isTransfer ? t.transferHint : t.amountHint}
      computeChanges={computeChanges}
      onSave={save}
      onDelete={(reason) => setDeleted(true, reason)}
      onRestore={(reason) => setDeleted(false, reason)}
    >
      {isTransfer ? (
        <>
          <AdminInput label={f.amount} type="text" inputMode="decimal" dir="ltr" value={transfer.amount} onChange={(e) => setTransfer((c) => ({ ...c, amount: e.target.value }))} />
          <AdminInput label={f.date} type="date" dir="ltr" value={transfer.occurred_on} onChange={(e) => setTransfer((c) => ({ ...c, occurred_on: e.target.value }))} />
          <AdminSelect label={f.fromAccount} value={transfer.from} onChange={(e) => setTransfer((c) => ({ ...c, from: e.target.value }))}>
            <option value="">{t.none}</option>
            {accountOptions}
          </AdminSelect>
          <AdminSelect label={f.toAccount} value={transfer.to} onChange={(e) => setTransfer((c) => ({ ...c, to: e.target.value }))}>
            <option value="">{t.none}</option>
            {accountOptions}
          </AdminSelect>
          <AdminInput label={f.note} value={transfer.note} onChange={(e) => setTransfer((c) => ({ ...c, note: e.target.value }))} />
        </>
      ) : (
        <>
          <AdminInput label={f.amount} type="text" inputMode="decimal" dir="ltr" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          <AdminInput label={f.date} type="date" dir="ltr" value={form.occurred_on} onChange={(e) => set({ occurred_on: e.target.value })} />
          <AdminSelect label={f.account} value={form.account_id} onChange={(e) => set({ account_id: e.target.value })}>
            {accountOptions}
          </AdminSelect>
          <AdminSelect label={f.category} value={form.category_id} onChange={(e) => set({ category_id: e.target.value })}>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect label={f.party} value={form.party_id} onChange={(e) => set({ party_id: e.target.value })}>
            <option value="">{t.none}</option>
            {options.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AdminSelect>
          <AdminInput label={f.note} value={form.note} onChange={(e) => set({ note: e.target.value })} />
          <AdminSelect label={f.kind} value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {TRANSACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {a.treasury.kinds[k] || t.kindNormal}
              </option>
            ))}
          </AdminSelect>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <AdminInput label={f.orderId} dir="ltr" placeholder="uuid" value={form.order_id} onChange={(e) => set({ order_id: e.target.value })} />
            <AdminSelect label={f.orderRole} value={form.order_role} onChange={(e) => set({ order_role: e.target.value })}>
              <option value="sale">{t.orderRoles.sale}</option>
              <option value="delivery_fee">{t.orderRoles.delivery_fee}</option>
            </AdminSelect>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{txn.receiptPath ? t.replaceReceipt : f.receipt}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading}
              onChange={(e) => void upload(e.target.files?.[0])}
              className="block w-full text-sm"
            />
            {uploading ? <span className="text-xs text-[var(--muted)]">{a.treasury.receiptUploading}</span> : null}
            {newReceipt ? <span className="text-xs text-[var(--success)]">✓</span> : null}
          </label>
          {txn.receiptPath && !newReceipt ? (
            <label className="flex min-h-[44px] items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5" checked={form.removeReceipt} onChange={(e) => set({ removeReceipt: e.target.checked })} />
              {f.removeReceipt}
            </label>
          ) : null}
        </>
      )}
    </OwnerEditSheet>
  );
}
