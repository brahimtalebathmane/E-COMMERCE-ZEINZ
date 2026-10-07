import { notFound } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminCard, AdminPageHeader } from "@/components/admin/ui";
import { formatMoney } from "@/lib/currency";
import { loadParties, loadSettlements, loadTransactions, loadUnsettledOrders } from "@/lib/treasury/data";
import { getTreasuryPageContext } from "../../context";
import { TreasuryTabs } from "../../TreasuryTabs";
import { TransactionsTable } from "../../TransactionsTable";
import { SettlementsList } from "./SettlementsList";

export const dynamic = "force-dynamic";

export default async function TreasuryPartyPage({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok || !ctx.goLive) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.statement} />
        <p className="admin-alert-error">{!ctx.ok ? a.treasury.onlyLocal : a.treasury.notLiveTitle}</p>
      </div>
    );
  }
  const parties = await loadParties(ctx.service, ctx.countryId);
  const party = parties.find((p) => p.id === partyId);
  if (!party) notFound();

  const isAgent = party.type === "delivery_agent";
  const [transactions, settlements, unsettled] = await Promise.all([
    loadTransactions(ctx.service, ctx.countryId, { partyId }),
    isAgent ? loadSettlements(ctx.service, ctx.countryId, partyId) : Promise.resolve([]),
    isAgent ? loadUnsettledOrders(ctx.service, ctx.countryId) : Promise.resolve([]),
  ]);
  const owed = unsettled.filter((o) => o.deliveryAgentId === partyId && o.kind === "sale");
  const owedTotal = owed.reduce((s, o) => s + o.totalPrice, 0);
  const net = transactions.rows.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={a.treasury.partyStatementTitle.replace("{name}", party.name)}
        subtitle={`${a.treasury.partyTypes[party.type]}${party.phone ? ` · ${party.phone}` : ""}`}
      />
      <TreasuryTabs />

      {isAgent ? (
        <AdminCard title={a.treasury.agentsTitle}>
          <p className="text-sm">
            {a.treasury.agentOrders.replace("{count}", String(owed.length))} ·{" "}
            <span className="font-bold text-amber-300" dir="ltr">
              {formatMoney(owedTotal, "MRU")}
            </span>
          </p>
        </AdminCard>
      ) : null}

      {isAgent ? (
        <AdminCard title={a.treasury.settlementsTitle}>
          <SettlementsList settlements={settlements} canManage={ctx.canManage} />
        </AdminCard>
      ) : null}

      <AdminCard
        noPadding
        title={a.treasury.nav.transactions}
        action={
          <span className={`text-sm font-bold tabular-nums ${net < 0 ? "text-red-400" : "text-emerald-400"}`} dir="ltr">
            {formatMoney(net, "MRU")}
          </span>
        }
      >
        {transactions.rows.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">{a.treasury.statementEmpty}</p>
        ) : (
          <TransactionsTable rows={transactions.rows} canManage={ctx.canManage} />
        )}
      </AdminCard>
    </div>
  );
}
