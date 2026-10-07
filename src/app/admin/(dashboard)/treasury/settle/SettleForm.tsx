"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { formatDateAr } from "@/lib/format-date";
import { settlementPreview } from "@/lib/treasury/calculations";
import { AdminBadge, AdminButton, AdminCard, AdminInput, AdminSelect } from "@/components/admin/ui";
import type { TreasuryAccount, TreasuryParty, UnsettledOrder } from "@/lib/treasury/data";
import { assignAgentAction, settleAction } from "../actions";

export function SettleForm({
  agents,
  selectedAgentId,
  accounts,
  unsettled,
  canManage,
  today,
}: {
  agents: TreasuryParty[];
  selectedAgentId: string | null;
  accounts: TreasuryAccount[];
  unsettled: UnsettledOrder[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const mine = useMemo(() => unsettled.filter((o) => o.deliveryAgentId === selectedAgentId), [unsettled, selectedAgentId]);
  const sales = mine.filter((o) => o.kind === "sale");
  const returns = mine.filter((o) => o.kind === "return_fee");
  const unassigned = unsettled.filter((o) => !o.deliveryAgentId);

  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [fees, setFees] = useState<Record<string, string>>({});
  const [keepFees, setKeepFees] = useState(true);
  const [received, setReceived] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [settledOn, setSettledOn] = useState(today);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const feeOf = (o: UnsettledOrder): number | null => {
    const raw = fees[o.orderId];
    if (raw !== undefined && raw.trim() !== "") return Number(raw);
    return o.deliveryCost;
  };
  const selectedSales = sales.filter((o) => ticked.has(o.orderId));
  const selectedReturns = returns.filter((o) => ticked.has(o.orderId));
  const preview = settlementPreview({
    sales: selectedSales.map((o) => ({ totalPrice: o.totalPrice, fee: feeOf(o) })),
    returns: selectedReturns.map((o) => ({ totalPrice: 0, fee: feeOf(o) })),
    agentKeepsFees: keepFees,
    received: received.trim() === "" ? null : Number(received),
  });
  const missingFee = keepFees && [...selectedSales, ...selectedReturns].some((o) => feeOf(o) == null);

  function toggle(id: string, on: boolean) {
    setTicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function assign(orderId: string, partyId: string) {
    const res = await assignAgentAction(orderId, partyId || null);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(a.treasury.saved);
      router.refresh();
    }
  }

  async function submit() {
    if (saving || !selectedAgentId) return;
    setSaving(true);
    try {
      const line = (o: UnsettledOrder) => {
        const raw = fees[o.orderId];
        return { orderId: o.orderId, fee: raw !== undefined && raw.trim() !== "" ? Number(raw) : null };
      };
      const res = await settleAction({
        partyId: selectedAgentId,
        accountId,
        settledOn,
        sales: selectedSales.map(line),
        returns: selectedReturns.map(line),
        agentKeepsFees: keepFees,
        received: Number(received),
        reason,
        note,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(a.treasury.settleDone);
      setTicked(new Set());
      setFees({});
      setReceived("");
      setReason("");
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const orderList = (list: UnsettledOrder[], kind: "sale" | "return_fee") => (
    <ul className="divide-y divide-[var(--admin-border)]">
      <li className="flex items-center gap-3 py-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          aria-label={a.treasury.selectAll}
          disabled={saving || !canManage}
          checked={list.length > 0 && list.every((o) => ticked.has(o.orderId))}
          onChange={(e) => list.forEach((o) => toggle(o.orderId, e.target.checked))}
        />
        {a.treasury.selectAll}
      </li>
      {list.map((o) => (
        <li key={o.orderId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
          <input
            type="checkbox"
            disabled={saving || !canManage}
            checked={ticked.has(o.orderId)}
            onChange={(e) => toggle(o.orderId, e.target.checked)}
            aria-label={o.orderId}
          />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{o.productName}</span>
            {o.quantity > 1 ? <span dir="ltr"> ×{o.quantity}</span> : null}{" "}
            <span className="text-xs text-[var(--muted)]">
              {o.customerName ?? "—"} · {formatDateAr(kind === "sale" ? o.shippedAt ?? o.orderedAt : o.returnedAt ?? o.orderedAt)}
            </span>
            {o.carriedOver ? (
              <span className="ms-2">
                <AdminBadge hue="neutral" size="sm">
                  {a.treasury.carriedOver}
                </AdminBadge>
              </span>
            ) : null}
          </span>
          {kind === "sale" ? (
            <span className="w-24 text-end tabular-nums" dir="ltr">
              {formatMoney(o.totalPrice, "MRU")}
            </span>
          ) : null}
          <label className="flex items-center gap-1 text-xs">
            <span className="text-[var(--muted)]">{a.treasury.colFee}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              disabled={saving || !canManage}
              value={fees[o.orderId] ?? (o.deliveryCost == null ? "" : String(o.deliveryCost))}
              placeholder={a.treasury.feeMissing}
              onChange={(e) => setFees((cur) => ({ ...cur, [o.orderId]: e.target.value }))}
              className={`admin-input w-24 !min-h-[36px] text-end tabular-nums ${o.deliveryCost == null && !fees[o.orderId] ? "border-amber-400/60" : ""}`}
            />
          </label>
          {canManage && agents.length > 1 ? (
            <select
              aria-label={a.treasury.moveTo}
              className="admin-input w-36 !min-h-[36px] text-xs"
              value=""
              disabled={saving}
              onChange={(e) => void assign(o.orderId, e.target.value)}
            >
              <option value="">{a.treasury.moveTo}</option>
              {agents
                .filter((ag) => ag.id !== selectedAgentId)
                .map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
            </select>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <AdminCard>
        <AdminSelect
          label={a.treasury.chooseAgent}
          value={selectedAgentId ?? ""}
          onChange={(e) => router.push(`/admin/treasury/settle?agent=${e.target.value}`)}
          className="sm:w-64"
        >
          {agents.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name}
            </option>
          ))}
        </AdminSelect>
      </AdminCard>

      {unassigned.length > 0 && canManage ? (
        <AdminCard title={`${a.treasury.unassignedSection} (${unassigned.length})`}>
          <ul className="divide-y divide-[var(--admin-border)]">
            {unassigned.map((o) => (
              <li key={o.orderId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{o.productName}</span>{" "}
                  <span className="text-xs text-[var(--muted)]">{o.customerName ?? "—"}</span>
                </span>
                <span className="tabular-nums" dir="ltr">
                  {formatMoney(o.totalPrice, "MRU")}
                </span>
                <select
                  aria-label={a.treasury.assignTo}
                  className="admin-input w-40 !min-h-[36px] text-xs"
                  value=""
                  onChange={(e) => void assign(o.orderId, e.target.value)}
                >
                  <option value="">{a.treasury.assignTo}</option>
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      {mine.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{a.treasury.noUnsettled}</p>
      ) : (
        <>
          {sales.length > 0 ? (
            <AdminCard title={`${a.treasury.salesSection} (${sales.length})`}>{orderList(sales, "sale")}</AdminCard>
          ) : null}
          {returns.length > 0 ? (
            <AdminCard title={`${a.treasury.returnsSection} (${returns.length})`}>{orderList(returns, "return_fee")}</AdminCard>
          ) : null}
        </>
      )}

      {canManage && mine.length > 0 ? (
        <AdminCard>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="keep-fees" checked={keepFees} disabled={saving} onChange={() => setKeepFees(true)} />
              {a.treasury.agentKeepsFees}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="keep-fees" checked={!keepFees} disabled={saving} onChange={() => setKeepFees(false)} />
              {a.treasury.agentKeepsFeesOff}
            </label>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted)]">{a.treasury.collected}</dt>
              <dd className="font-bold tabular-nums" dir="ltr">
                {formatMoney(preview.collected, "MRU")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">{a.treasury.fees}</dt>
              <dd className="font-bold tabular-nums" dir="ltr">
                {formatMoney(preview.fees, "MRU")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">{a.treasury.expected}</dt>
              <dd className={`font-bold tabular-nums ${preview.expectedNet < 0 ? "text-amber-300" : "text-emerald-400"}`} dir="ltr">
                {formatMoney(preview.expectedNet, "MRU")}
              </dd>
            </div>
          </dl>
          {preview.expectedNet < 0 ? <p className="mt-1 text-xs text-amber-300">{a.treasury.expectedNegative}</p> : null}
          {missingFee ? <p className="mt-1 text-xs text-amber-400">{a.treasury.feeMissing}</p> : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <AdminInput
              label={a.treasury.received}
              hint={a.treasury.receivedHint}
              type="number"
              inputMode="decimal"
              step="0.01"
              dir="ltr"
              value={received}
              disabled={saving}
              onChange={(e) => setReceived(e.target.value)}
            />
            <AdminSelect label={a.treasury.receivedInto} value={accountId} disabled={saving} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </AdminSelect>
            <AdminInput
              label={a.treasury.date}
              type="date"
              dir="ltr"
              max={today}
              value={settledOn}
              disabled={saving}
              onChange={(e) => setSettledOn(e.target.value)}
            />
          </div>
          {received.trim() !== "" && preview.difference !== 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-amber-400">
                {a.treasury.difference}: <span dir="ltr">{formatMoney(preview.difference, "MRU")}</span>
              </p>
              <AdminInput label={a.treasury.differenceReason} value={reason} disabled={saving} onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          <div className="mt-3">
            <AdminInput label={a.treasury.note} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="mt-4 flex justify-end">
            <AdminButton
              disabled={
                saving ||
                ticked.size === 0 ||
                received.trim() === "" ||
                !accountId ||
                (preview.difference !== 0 && !reason.trim())
              }
              onClick={() => void submit()}
            >
              {saving ? a.treasury.saving : a.treasury.settleSubmit}
            </AdminButton>
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}
