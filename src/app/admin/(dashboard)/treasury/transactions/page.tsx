import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminCard, AdminPageHeader } from "@/components/admin/ui";
import { formatMoney } from "@/lib/currency";
import { loadAccounts, loadCategories, loadParties, loadTransactions } from "@/lib/treasury/data";
import { getTreasuryPageContext } from "../context";
import { TreasuryTabs } from "../TreasuryTabs";
import { TransactionsTable } from "../TransactionsTable";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pick(value: string | string[] | undefined, re: RegExp): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && re.test(v) ? v : null;
}

export default async function TreasuryTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok || !ctx.goLive) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.treasury.nav.transactions} />
        <p className="admin-alert-error">{!ctx.ok ? a.treasury.onlyLocal : a.treasury.notLiveTitle}</p>
      </div>
    );
  }
  const params = await searchParams;
  const filters = {
    from: pick(params.from, ISO_DATE_RE),
    to: pick(params.to, ISO_DATE_RE),
    accountId: pick(params.account, UUID_RE),
    categoryId: pick(params.category, UUID_RE),
    partyId: pick(params.party, UUID_RE),
  };

  const [accounts, categories, parties, result] = await Promise.all([
    loadAccounts(ctx.service, ctx.countryId),
    loadCategories(ctx.service, ctx.countryId),
    loadParties(ctx.service, ctx.countryId),
    loadTransactions(ctx.service, ctx.countryId, filters),
  ]);
  const sum = result.rows.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader title={a.treasury.nav.transactions} />
      <TreasuryTabs />
      <AdminCard>
        {/* Plain GET form: filters live in the URL, so a filtered view can be bookmarked or shared. */}
        <form method="get" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{a.treasury.filters.from}</span>
            <input type="date" name="from" defaultValue={filters.from ?? ""} dir="ltr" className="admin-input" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{a.treasury.filters.to}</span>
            <input type="date" name="to" defaultValue={filters.to ?? ""} dir="ltr" className="admin-input" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{a.treasury.account}</span>
            <select name="account" defaultValue={filters.accountId ?? ""} className="admin-input">
              <option value="">{a.treasury.filters.all}</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{a.treasury.category}</span>
            <select name="category" defaultValue={filters.categoryId ?? ""} className="admin-input">
              <option value="">{a.treasury.filters.all}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `— ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{a.treasury.colParty}</span>
            <select name="party" defaultValue={filters.partyId ?? ""} className="admin-input">
              <option value="">{a.treasury.filters.all}</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="admin-btn-primary flex-1">
              {a.treasury.filters.apply}
            </button>
            <Link href="/admin/treasury/transactions" className="admin-btn-ghost">
              {a.treasury.filters.reset}
            </Link>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        noPadding
        title={a.treasury.nav.transactions}
        action={
          <span className={`text-sm font-bold tabular-nums ${sum < 0 ? "text-red-400" : "text-emerald-400"}`} dir="ltr">
            {formatMoney(sum, "MRU")}
          </span>
        }
      >
        {result.truncated ? <p className="px-4 pt-3 text-xs text-amber-400">{a.treasury.truncated}</p> : null}
        <TransactionsTable rows={result.rows} canManage={ctx.canManage} />
      </AdminCard>
    </div>
  );
}
