"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateAr } from "@/lib/format-date";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import type { AccountType, UnsettledOrder } from "@/lib/treasury/data";
import { treasuryGoLiveAction } from "../actions";

type AccountDraft = { key: number; name: string; type: AccountType; opening: string };
let key = 0;
const draft = (name = "", type: AccountType = "cash"): AccountDraft => ({ key: ++key, name, type, opening: "" });

export function GoLiveForm({ shippedOrders, today }: { shippedOrders: UnsettledOrder[]; today: string }) {
  const router = useRouter();
  const [goLiveOn, setGoLiveOn] = useState(today);
  const [accounts, setAccounts] = useState<AccountDraft[]>([draft("الصندوق", "cash"), draft("Bankily", "mobile_wallet")]);
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [unpaid, setUnpaid] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const named = accounts.filter((acc) => acc.name.trim());
  const invalidOpening = named.some((acc) => acc.opening.trim() !== "" && !(Number(acc.opening) >= 0));
  const unpaidTotal = shippedOrders.filter((o) => unpaid.has(o.orderId)).reduce((s, o) => s + o.totalPrice, 0);

  function update(k: number, patch: Partial<AccountDraft>) {
    setAccounts((cur) => cur.map((acc) => (acc.key === k ? { ...acc, ...patch } : acc)));
  }

  async function submit() {
    setConfirming(false);
    if (saving) return;
    setSaving(true);
    try {
      const res = await treasuryGoLiveAction({
        goLiveOn,
        accounts: named.map((acc) => ({ name: acc.name.trim(), type: acc.type, openingBalance: Number(acc.opening) || 0 })),
        agentName,
        agentPhone,
        carriedOverOrderIds: [...unpaid],
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.goLiveDone);
      router.push("/admin/treasury");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminCard>
        <AdminInput
          label={a.treasury.goLiveDate}
          hint={a.treasury.goLiveDateHint}
          type="date"
          dir="ltr"
          max={today}
          value={goLiveOn}
          disabled={saving}
          onChange={(e) => setGoLiveOn(e.target.value)}
          className="sm:w-48"
        />
      </AdminCard>

      <AdminCard title={a.treasury.accountsStep}>
        <ul className="space-y-3">
          {accounts.map((acc) => (
            <li key={acc.key} className="grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr_auto] sm:items-end">
              <AdminInput label={a.treasury.accountName} value={acc.name} disabled={saving} onChange={(e) => update(acc.key, { name: e.target.value })} />
              <AdminSelect label={a.treasury.accountType} value={acc.type} disabled={saving} onChange={(e) => update(acc.key, { type: e.target.value as AccountType })}>
                {(["cash", "bank", "mobile_wallet", "person_custody"] as const).map((t) => (
                  <option key={t} value={t}>
                    {a.treasury.accountTypes[t]}
                  </option>
                ))}
              </AdminSelect>
              <AdminInput
                label={a.treasury.openingBalance}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                dir="ltr"
                value={acc.opening}
                disabled={saving}
                onChange={(e) => update(acc.key, { opening: e.target.value })}
              />
              <AdminButton variant="sm-ghost" disabled={saving || accounts.length === 1} onClick={() => setAccounts((cur) => cur.filter((x) => x.key !== acc.key))}>
                {a.treasury.remove}
              </AdminButton>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <AdminButton variant="ghost" disabled={saving} onClick={() => setAccounts((cur) => [...cur, draft()])}>
            {a.treasury.addAccount}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title={a.treasury.agentStep}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminInput label={a.treasury.agentName} value={agentName} disabled={saving} onChange={(e) => setAgentName(e.target.value)} />
          <AdminInput label={a.treasury.agentPhone} dir="ltr" value={agentPhone} disabled={saving} onChange={(e) => setAgentPhone(e.target.value)} />
        </div>
      </AdminCard>

      <AdminCard title={a.treasury.carriedStep}>
        <p className="text-xs text-[var(--muted)]">{a.treasury.carriedHint}</p>
        {shippedOrders.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{a.treasury.carriedNone}</p>
        ) : (
          <ul className="mt-3 max-h-[28rem] divide-y divide-[var(--admin-border)] overflow-y-auto">
            {shippedOrders.map((o) => (
              <li key={o.orderId}>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={unpaid.has(o.orderId)}
                    onChange={(e) =>
                      setUnpaid((cur) => {
                        const next = new Set(cur);
                        if (e.target.checked) next.add(o.orderId);
                        else next.delete(o.orderId);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{o.productName}</span>{" "}
                    <span className="text-xs text-[var(--muted)]">
                      {o.customerName ?? "—"} · {formatDateAr(o.orderedAt)}
                    </span>
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {formatMoney(o.totalPrice, "MRU")}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {unpaid.size > 0 ? (
          <p className="mt-2 text-sm font-semibold text-amber-300" dir="rtl">
            {unpaid.size} · <span dir="ltr">{formatMoney(unpaidTotal, "MRU")}</span>
          </p>
        ) : null}
      </AdminCard>

      <div className="flex justify-end">
        <AdminButton disabled={saving || named.length === 0 || invalidOpening || !agentName.trim()} onClick={() => setConfirming(true)}>
          {saving ? a.treasury.saving : a.treasury.goLiveSubmit}
        </AdminButton>
      </div>

      <ConfirmDialog
        open={confirming}
        title={a.treasury.goLiveSubmit}
        message={a.treasury.goLiveConfirm.replace("{accounts}", String(named.length)).replace("{orders}", String(unpaid.size))}
        confirmLabel={a.treasury.confirm}
        cancelLabel={a.treasury.cancel}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
