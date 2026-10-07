"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { AdminBadge, AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import type { AgentHolding, TreasuryAccount, TreasuryCategory, TreasuryParty } from "@/lib/treasury/data";
import { addTransactionAction, cashCountAction, transferAction } from "./actions";

/** Categories that have their own screen and never appear in the quick add. */
const DEDICATED_KEYS = new Set(["transfer", "opening_balance", "cash_difference", "settlement_difference"]);

export function TreasuryDashboard({
  accounts,
  holdings,
  categories,
  parties,
  canManage,
  today,
}: {
  accounts: TreasuryAccount[];
  holdings: AgentHolding[];
  categories: TreasuryCategory[];
  parties: TreasuryParty[];
  canManage: boolean;
  today: string;
}) {
  const active = accounts.filter((acc) => acc.isActive);
  const total = accounts.reduce((s, acc) => s + acc.balance, 0);
  const partyName = (id: string | null) => parties.find((p) => p.id === id)?.name ?? a.treasury.unassigned;
  const [dialog, setDialog] = useState<null | { kind: "count"; account: TreasuryAccount } | { kind: "transfer" }>(null);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <AdminCard
          title={a.treasury.accountsTitle}
          action={
            canManage && active.length > 1 ? (
              <AdminButton variant="sm-ghost" onClick={() => setDialog({ kind: "transfer" })}>
                {a.treasury.transfer}
              </AdminButton>
            ) : null
          }
        >
          {accounts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{a.treasury.noAccounts}</p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border)]">
              {accounts.map((acc) => (
                <li key={acc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{acc.name}</span>{" "}
                    <span className="text-xs text-[var(--muted)]">{a.treasury.accountTypes[acc.type]}</span>
                    {!acc.isActive ? (
                      <span className="ms-2">
                        <AdminBadge hue="neutral" size="sm">
                          {a.treasury.archived}
                        </AdminBadge>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`font-bold tabular-nums ${acc.balance < 0 ? "text-red-400" : ""}`} dir="ltr">
                      {formatMoney(acc.balance, "MRU")}
                    </span>
                    {canManage && acc.isActive ? (
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "count", account: acc })}
                        className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {a.treasury.cashCount}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-semibold">{a.treasury.total}</span>
                <span className="font-bold tabular-nums" dir="ltr">
                  {formatMoney(total, "MRU")}
                </span>
              </li>
            </ul>
          )}
        </AdminCard>

        <AdminCard title={a.treasury.agentsTitle}>
          <p className="text-xs text-[var(--muted)]">{a.treasury.agentsHint}</p>
          {holdings.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">{a.treasury.noAgents}</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--admin-border)]">
              {holdings.map((h) => (
                <li key={h.partyId ?? "none"} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">{partyName(h.partyId)}</span>{" "}
                    <span className="text-xs text-[var(--muted)]">
                      {a.treasury.agentOrders.replace("{count}", String(h.unsettledOrders))}
                      {h.returnsAwaitingFee > 0
                        ? ` · ${a.treasury.agentReturns.replace("{count}", String(h.returnsAwaitingFee))}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-bold tabular-nums text-amber-300" dir="ltr">
                      {formatMoney(h.cashHeld, "MRU")}
                    </span>
                    {h.partyId ? (
                      <>
                        {canManage ? (
                          <Link
                            href={`/admin/treasury/settle?agent=${h.partyId}`}
                            className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                          >
                            {a.treasury.settleWith}
                          </Link>
                        ) : null}
                        <Link
                          href={`/admin/treasury/parties/${h.partyId}`}
                          className="text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:underline"
                        >
                          {a.treasury.statement}
                        </Link>
                      </>
                    ) : (
                      <Link href="/admin/treasury/settle" className="text-xs font-semibold text-[var(--accent)]">
                        {a.treasury.assignTo}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {canManage && active.length > 0 ? (
        <QuickAddForm accounts={active} categories={categories} parties={parties} today={today} />
      ) : null}

      {dialog?.kind === "count" ? (
        <CashCountDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "transfer" ? (
        <TransferDialog accounts={active} today={today} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function QuickAddForm({
  accounts,
  categories,
  parties,
  today,
}: {
  accounts: TreasuryAccount[];
  categories: TreasuryCategory[];
  parties: TreasuryParty[];
  today: string;
}) {
  const router = useRouter();
  const options = useMemo(() => {
    const usable = categories.filter((c) => c.isActive && !(c.systemKey && DEDICATED_KEYS.has(c.systemKey)));
    const roots = usable.filter((c) => !c.parentId);
    return roots.flatMap((root) => [root, ...usable.filter((c) => c.parentId === root.id)]);
  }, [categories]);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [partyId, setPartyId] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const category = categories.find((c) => c.id === categoryId);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/treasury/receipt", { method: "POST", body, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !json.path) throw new Error(json.error || "upload failed");
      setReceiptPath(json.path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (saving || !category) return;
    setSaving(true);
    try {
      const res = await addTransactionAction({
        accountId,
        categoryId,
        amount: Number(amount),
        partyId: partyId || null,
        occurredOn,
        note,
        receiptPath,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.saved);
      setAmount("");
      setNote("");
      setReceiptPath(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCard title={a.treasury.quickAddTitle}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AdminSelect label={a.treasury.category} value={categoryId} disabled={saving} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">—</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `— ${c.name}` : c.name} ({a.treasury.directions[c.direction]})
            </option>
          ))}
        </AdminSelect>
        <AdminInput
          label={a.treasury.amount}
          hint={category?.direction === "adjustment" ? a.treasury.amountSignedHint : undefined}
          type="number"
          inputMode="decimal"
          step="0.01"
          dir="ltr"
          value={amount}
          disabled={saving}
          onChange={(e) => setAmount(e.target.value)}
        />
        <AdminSelect label={a.treasury.account} value={accountId} disabled={saving} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect label={a.treasury.party} value={partyId} disabled={saving} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">—</option>
          {parties
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({a.treasury.partyTypes[p.type]})
              </option>
            ))}
        </AdminSelect>
        <AdminInput
          label={a.treasury.date}
          type="date"
          dir="ltr"
          max={today}
          value={occurredOn}
          disabled={saving}
          onChange={(e) => setOccurredOn(e.target.value)}
        />
        <AdminInput label={a.treasury.note} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} />
        <label className="block space-y-1.5 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-semibold">{a.treasury.receipt}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={saving || uploading}
            onChange={(e) => void upload(e.target.files?.[0])}
            className="block w-full text-xs"
          />
          {uploading ? <span className="text-xs text-[var(--muted)]">{a.treasury.receiptUploading}</span> : null}
          {receiptPath ? <span className="text-xs text-emerald-400">✓</span> : null}
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <AdminButton disabled={saving || uploading || !category || !Number(amount) || !accountId} onClick={() => void submit()}>
          {saving ? a.treasury.saving : a.treasury.save}
        </AdminButton>
      </div>
    </AdminCard>
  );
}

function DialogShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="admin-card w-full max-w-md space-y-3 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function CashCountDialog({ account, onClose }: { account: TreasuryAccount; onClose: () => void }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = counted.trim() === "" ? null : Math.round((Number(counted) - account.balance) * 100) / 100;

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await cashCountAction({ accountId: account.id, counted: Number(counted), reason });
      if (!res.ok) throw new Error(res.error);
      toast.success(res.difference === 0 ? a.treasury.cashCountMatch : a.treasury.cashCountDone);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={`${a.treasury.cashCountTitle} — ${account.name}`}>
      <p className="text-xs text-[var(--muted)]">{a.treasury.cashCountHint}</p>
      <p className="text-sm">
        {a.treasury.systemBalance}: <span dir="ltr">{formatMoney(account.balance, "MRU")}</span>
      </p>
      <AdminInput
        label={a.treasury.countedAmount}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        dir="ltr"
        value={counted}
        disabled={busy}
        onChange={(e) => setCounted(e.target.value)}
      />
      {diff != null ? (
        <p className={`text-sm font-semibold ${diff === 0 ? "text-emerald-400" : "text-amber-400"}`}>
          {a.treasury.difference}: <span dir="ltr">{formatMoney(diff, "MRU")}</span>
        </p>
      ) : null}
      {diff != null && diff !== 0 ? (
        <AdminInput label={a.treasury.reason} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      <div className="flex justify-end gap-2">
        <AdminButton variant="ghost" disabled={busy} onClick={onClose}>
          {a.treasury.cancel}
        </AdminButton>
        <AdminButton disabled={busy || diff == null || (diff !== 0 && !reason.trim())} onClick={() => void submit()}>
          {a.treasury.confirm}
        </AdminButton>
      </div>
    </DialogShell>
  );
}

function TransferDialog({ accounts, today, onClose }: { accounts: TreasuryAccount[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await transferAction({ fromAccountId: from, toAccountId: to, amount: Number(amount), occurredOn, note });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.saved);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={a.treasury.transferTitle}>
      <AdminSelect label={a.treasury.from} value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)}>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.name} ({formatMoney(acc.balance, "MRU")})
          </option>
        ))}
      </AdminSelect>
      <AdminSelect label={a.treasury.to} value={to} disabled={busy} onChange={(e) => setTo(e.target.value)}>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.name}
          </option>
        ))}
      </AdminSelect>
      <AdminInput
        label={a.treasury.amount}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        dir="ltr"
        value={amount}
        disabled={busy}
        onChange={(e) => setAmount(e.target.value)}
      />
      <AdminInput label={a.treasury.date} type="date" dir="ltr" max={today} value={occurredOn} disabled={busy} onChange={(e) => setOccurredOn(e.target.value)} />
      <AdminInput label={a.treasury.note} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <AdminButton variant="ghost" disabled={busy} onClick={onClose}>
          {a.treasury.cancel}
        </AdminButton>
        <AdminButton disabled={busy || !(Number(amount) > 0) || from === to} onClick={() => void submit()}>
          {a.treasury.transfer}
        </AdminButton>
      </div>
    </DialogShell>
  );
}
