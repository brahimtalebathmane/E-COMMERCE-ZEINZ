import { adminAr as a } from "@/locales/admin-ar";
import { AdminCard, AdminLinkButton, AdminPageHeader } from "@/components/admin/ui";
import { formatDateAr, todayKeyNouakchott } from "@/lib/format-date";
import {
  loadAccounts,
  loadAgentHoldings,
  loadCategories,
  loadParties,
  loadTransactions,
} from "@/lib/treasury/data";
import { getTreasuryPageContext } from "./context";
import { TreasuryTabs } from "./TreasuryTabs";
import { TreasuryDashboard } from "./TreasuryDashboard";
import { TransactionsTable } from "./TransactionsTable";

export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.title} />
        <p className="admin-alert-error">{a.treasury.onlyLocal}</p>
      </div>
    );
  }
  if (!ctx.goLive) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.title} subtitle={a.treasury.subtitle} />
        <AdminCard title={a.treasury.notLiveTitle}>
          <p className="text-sm text-[var(--muted)]">{a.treasury.notLiveBody}</p>
          {ctx.canManage ? (
            <div className="mt-4">
              <AdminLinkButton href="/admin/treasury/setup">{a.treasury.setUp}</AdminLinkButton>
            </div>
          ) : null}
        </AdminCard>
      </div>
    );
  }

  const [accounts, holdings, categories, parties, recent] = await Promise.all([
    loadAccounts(ctx.service, ctx.countryId),
    loadAgentHoldings(ctx.service, ctx.countryId),
    loadCategories(ctx.service, ctx.countryId),
    loadParties(ctx.service, ctx.countryId),
    loadTransactions(ctx.service, ctx.countryId, {}, 10),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={a.treasury.title}
        subtitle={a.treasury.liveSince.replace("{date}", formatDateAr(ctx.goLive.goLiveOn))}
      />
      <TreasuryTabs />
      <TreasuryDashboard
        accounts={accounts}
        holdings={holdings}
        categories={categories}
        parties={parties}
        canManage={ctx.canManage}
        today={todayKeyNouakchott()}
      />
      <AdminCard
        title={a.treasury.recentTitle}
        noPadding
        action={
          <AdminLinkButton href="/admin/treasury/transactions" variant="sm-ghost">
            {a.treasury.viewAll}
          </AdminLinkButton>
        }
      >
        <TransactionsTable rows={recent.rows} canManage={ctx.canManage} />
      </AdminCard>
    </div>
  );
}
