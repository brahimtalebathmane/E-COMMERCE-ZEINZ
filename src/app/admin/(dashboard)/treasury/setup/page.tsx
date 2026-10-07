import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { todayKeyNouakchott } from "@/lib/format-date";
import { loadAccounts, loadCategories, loadParties, loadRecentlyShippedForGoLive } from "@/lib/treasury/data";
import { getTreasuryPageContext } from "../context";
import { TreasuryTabs } from "../TreasuryTabs";
import { GoLiveForm } from "./GoLiveForm";
import { TreasurySettings } from "./TreasurySettings";

export const dynamic = "force-dynamic";

export default async function TreasurySetupPage() {
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.settingsTitle} />
        <p className="admin-alert-error">{a.treasury.onlyLocal}</p>
      </div>
    );
  }

  if (!ctx.goLive) {
    const shipped = ctx.canManage ? await loadRecentlyShippedForGoLive(ctx.service, ctx.countryId) : [];
    return (
      <div className="space-y-5">
        <AdminPageHeader title={a.treasury.setupTitle} subtitle={a.treasury.notLiveBody} />
        {ctx.canManage ? (
          <GoLiveForm shippedOrders={shipped} today={todayKeyNouakchott()} />
        ) : (
          <p className="text-sm text-[var(--muted)]">{a.treasury.notLiveTitle}</p>
        )}
      </div>
    );
  }

  const [accounts, categories, parties] = await Promise.all([
    loadAccounts(ctx.service, ctx.countryId),
    loadCategories(ctx.service, ctx.countryId),
    loadParties(ctx.service, ctx.countryId),
  ]);
  return (
    <div className="space-y-5">
      <AdminPageHeader title={a.treasury.settingsTitle} />
      <TreasuryTabs />
      <TreasurySettings accounts={accounts} categories={categories} parties={parties} canManage={ctx.canManage} />
    </div>
  );
}
