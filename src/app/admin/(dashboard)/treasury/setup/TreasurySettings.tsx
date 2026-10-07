"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { AdminBadge, AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import type {
  AccountType,
  CategoryDirection,
  CountedInProfitBy,
  PartyType,
  TreasuryAccount,
  TreasuryCategory,
  TreasuryParty,
} from "@/lib/treasury/data";
import {
  createAccountAction,
  createCategoryAction,
  createPartyAction,
  setDefaultAgentAction,
  updateAccountAction,
} from "../actions";

async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone: () => void) {
  const res = await action();
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  toast.success(a.treasury.saved);
  onDone();
  return true;
}

export function TreasurySettings({
  accounts,
  categories,
  parties,
  canManage,
}: {
  accounts: TreasuryAccount[];
  categories: TreasuryCategory[];
  parties: TreasuryParty[];
  canManage: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  // New account
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("mobile_wallet");
  const [accOpening, setAccOpening] = useState("");
  // New category
  const [catName, setCatName] = useState("");
  const [catParent, setCatParent] = useState("");
  const [catDirection, setCatDirection] = useState<CategoryDirection>("expense");
  const [catCounted, setCatCounted] = useState<CountedInProfitBy>("opex");
  // New party
  const [partyName, setPartyName] = useState("");
  const [partyType, setPartyType] = useState<PartyType>("delivery_agent");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyDefault, setPartyDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  async function guarded(fn: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const roots = categories.filter((c) => !c.parentId);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <AdminCard title={a.treasury.accountsTitle}>
        <ul className="divide-y divide-[var(--admin-border)]">
          {accounts.map((acc) => (
            <li key={acc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
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
                <span className="tabular-nums text-sm" dir="ltr">
                  {formatMoney(acc.balance, "MRU")}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void guarded(() => run(() => updateAccountAction({ accountId: acc.id, isActive: !acc.isActive }), refresh))}
                    className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {acc.isActive ? a.treasury.archive : a.treasury.unarchive}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--admin-border)] pt-4 sm:grid-cols-3 sm:items-end">
            <AdminInput label={a.treasury.newAccount} value={accName} disabled={busy} onChange={(e) => setAccName(e.target.value)} />
            <AdminSelect label={a.treasury.accountType} value={accType} disabled={busy} onChange={(e) => setAccType(e.target.value as AccountType)}>
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
              value={accOpening}
              disabled={busy}
              onChange={(e) => setAccOpening(e.target.value)}
            />
            <div className="sm:col-span-3">
              <AdminButton
                disabled={busy || !accName.trim()}
                onClick={() =>
                  void guarded(() =>
                    run(() => createAccountAction({ name: accName, type: accType, openingBalance: Number(accOpening) || 0 }), () => {
                      setAccName("");
                      setAccOpening("");
                      refresh();
                    }),
                  )
                }
              >
                {a.treasury.save}
              </AdminButton>
            </div>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title={a.treasury.partiesTitle}>
        <ul className="divide-y divide-[var(--admin-border)]">
          {parties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link href={`/admin/treasury/parties/${p.id}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>{" "}
                <span className="text-xs text-[var(--muted)]">{a.treasury.partyTypes[p.type]}</span>
                {p.isDefaultAgent ? (
                  <span className="ms-2">
                    <AdminBadge hue="emerald" size="sm">
                      {a.treasury.defaultAgent}
                    </AdminBadge>
                  </span>
                ) : null}
              </span>
              {canManage && p.type === "delivery_agent" && !p.isDefaultAgent ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void guarded(() => run(() => setDefaultAgentAction(p.id), refresh))}
                  className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  {a.treasury.setDefault}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--admin-border)] pt-4 sm:grid-cols-3 sm:items-end">
            <AdminInput label={a.treasury.partyName} value={partyName} disabled={busy} onChange={(e) => setPartyName(e.target.value)} />
            <AdminSelect label={a.treasury.partyType} value={partyType} disabled={busy} onChange={(e) => setPartyType(e.target.value as PartyType)}>
              {(["delivery_agent", "supplier", "employee", "other"] as const).map((t) => (
                <option key={t} value={t}>
                  {a.treasury.partyTypes[t]}
                </option>
              ))}
            </AdminSelect>
            <AdminInput label={a.treasury.partyPhone} dir="ltr" value={partyPhone} disabled={busy} onChange={(e) => setPartyPhone(e.target.value)} />
            {partyType === "delivery_agent" ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={partyDefault} disabled={busy} onChange={(e) => setPartyDefault(e.target.checked)} />
                {a.treasury.makeDefault}
              </label>
            ) : null}
            <div className="sm:col-span-3">
              <AdminButton
                disabled={busy || !partyName.trim()}
                onClick={() =>
                  void guarded(() =>
                    run(
                      () => createPartyAction({ name: partyName, type: partyType, phone: partyPhone, makeDefaultAgent: partyDefault }),
                      () => {
                        setPartyName("");
                        setPartyPhone("");
                        setPartyDefault(false);
                        refresh();
                      },
                    ),
                  )
                }
              >
                {a.treasury.save}
              </AdminButton>
            </div>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title={a.treasury.categoriesTitle} className="lg:col-span-2">
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {roots.map((root) => (
            <li key={root.id} className="border-b border-[var(--admin-border)] py-2 text-sm">
              <span className="font-semibold">{root.name}</span>{" "}
              <span className="text-xs text-[var(--muted)]">
                {a.treasury.directions[root.direction]} · {a.treasury.counted[root.countedInProfitBy]}
              </span>
              {root.systemKey ? (
                <span className="ms-2">
                  <AdminBadge hue="neutral" size="sm">
                    {a.treasury.system}
                  </AdminBadge>
                </span>
              ) : null}
              <ul className="ms-4">
                {categories
                  .filter((c) => c.parentId === root.id)
                  .map((c) => (
                    <li key={c.id} className="text-xs text-[var(--muted)]">
                      — {c.name}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--admin-border)] pt-4 sm:grid-cols-4 sm:items-end">
            <AdminInput label={a.treasury.newCategory} value={catName} disabled={busy} onChange={(e) => setCatName(e.target.value)} />
            <AdminSelect label={a.treasury.parentCategory} value={catParent} disabled={busy} onChange={(e) => setCatParent(e.target.value)}>
              <option value="">—</option>
              {roots.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </AdminSelect>
            <AdminSelect
              label={a.treasury.direction}
              value={catDirection}
              disabled={busy || Boolean(catParent)}
              onChange={(e) => setCatDirection(e.target.value as CategoryDirection)}
            >
              {(["income", "expense", "adjustment"] as const).map((d) => (
                <option key={d} value={d}>
                  {a.treasury.directions[d]}
                </option>
              ))}
            </AdminSelect>
            <AdminSelect
              label={a.treasury.countedInProfit}
              value={catCounted}
              disabled={busy || Boolean(catParent)}
              onChange={(e) => setCatCounted(e.target.value as CountedInProfitBy)}
            >
              {(["opex", "none", "orders"] as const).map((c) => (
                <option key={c} value={c}>
                  {a.treasury.counted[c]}
                </option>
              ))}
            </AdminSelect>
            <div className="sm:col-span-4">
              <AdminButton
                disabled={busy || !catName.trim()}
                onClick={() =>
                  void guarded(() =>
                    run(
                      () =>
                        createCategoryAction({
                          name: catName,
                          parentId: catParent || null,
                          direction: catParent ? null : catDirection,
                          countedInProfitBy: catParent ? null : catCounted,
                        }),
                      () => {
                        setCatName("");
                        refresh();
                      },
                    ),
                  )
                }
              >
                {a.treasury.save}
              </AdminButton>
            </div>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
