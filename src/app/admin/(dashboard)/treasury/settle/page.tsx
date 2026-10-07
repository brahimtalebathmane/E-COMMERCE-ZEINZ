import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { todayKeyNouakchott } from "@/lib/format-date";
import { loadAccounts, loadParties, loadUnsettledOrders } from "@/lib/treasury/data";
import { getTreasuryPageContext } from "../context";
import { TreasuryTabs } from "../TreasuryTabs";
import { SettleForm } from "./SettleForm";

export const dynamic = "force-dynamic";

export default async function TreasurySettlePage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok || !ctx.goLive) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.settleTitle} />
        <p className="admin-alert-error">{!ctx.ok ? a.treasury.onlyLocal : a.treasury.notLiveTitle}</p>
      </div>
    );
  }
  const [{ agent }, parties, accounts, unsettled] = await Promise.all([
    searchParams,
    loadParties(ctx.service, ctx.countryId),
    loadAccounts(ctx.service, ctx.countryId),
    loadUnsettledOrders(ctx.service, ctx.countryId),
  ]);
  const agents = parties.filter((p) => p.type === "delivery_agent" && p.isActive);
  const selected = agents.find((p) => p.id === agent) ?? agents.find((p) => p.isDefaultAgent) ?? agents[0] ?? null;

  return (
    <div className="space-y-5">
      <AdminPageHeader title={a.treasury.settleTitle} subtitle={a.treasury.settleHint} />
      <TreasuryTabs />
      <SettleForm
        key={selected?.id ?? "none"}
        agents={agents}
        selectedAgentId={selected?.id ?? null}
        accounts={accounts.filter((acc) => acc.isActive)}
        unsettled={unsettled}
        canManage={ctx.canManage}
        today={todayKeyNouakchott()}
      />
    </div>
  );
}
