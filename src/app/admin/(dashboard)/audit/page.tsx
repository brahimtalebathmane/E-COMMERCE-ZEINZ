import Link from "next/link";
import { redirect } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminBadge, AdminCard, AdminPageHeader } from "@/components/admin/ui";
import { assertOwnerUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateTimeAr } from "@/lib/format-date";
import { auditChanges } from "@/lib/owner-edits/patch";

export const dynamic = "force-dynamic";

const t = a.owner;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 300;
const ENTITIES = Object.keys(t.auditEntities) as (keyof typeof t.auditEntities)[];
const HUE = { insert: "sky", update: "amber", delete: "red", restore: "emerald" } as const;

/** Owner only: every owner edit, delete and restore (migration 076's owner_edit_log). */
export default async function OwnerAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; entity?: string }>;
}) {
  try {
    await assertOwnerUser();
  } catch {
    redirect("/admin?error=forbidden");
  }
  const params = await searchParams;
  const from = params.from && DATE_RE.test(params.from) ? params.from : "";
  const to = params.to && DATE_RE.test(params.to) ? params.to : "";
  const entity = ENTITIES.includes(params.entity as never) ? (params.entity as (typeof ENTITIES)[number]) : "";

  const service = createServiceClient();
  let query = service
    .from("owner_edit_log")
    .select("id, created_at, actor, entity, entity_id, action, old_data, new_data, reason")
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1);
  // Africa/Nouakchott is UTC+0: a day key is a UTC day.
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lt("created_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString());
  if (entity) query = query.eq("entity", entity);
  const { data, error } = await query;
  const rows = (data ?? []).slice(0, LIMIT);

  const actorIds = [...new Set(rows.map((r) => r.actor).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await service.from("profiles").select("id, display_name, email").in("id", actorIds);
    for (const p of profiles ?? []) names.set(String(p.id), String(p.display_name || p.email || ""));
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader title={t.auditTitle} subtitle={t.auditSubtitle} />

      <AdminCard>
        <form method="get" className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{t.auditFrom}</span>
            <input type="date" name="from" defaultValue={from} dir="ltr" className="admin-input" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{t.auditTo}</span>
            <input type="date" name="to" defaultValue={to} dir="ltr" className="admin-input" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{t.auditEntity}</span>
            <select name="entity" defaultValue={entity} className="admin-input">
              <option value="">{t.auditAll}</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {t.auditEntities[e]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="admin-btn-primary flex-1">
              {t.auditApply}
            </button>
            <Link href="/admin/audit" className="admin-btn-ghost">
              {a.treasury.filters.reset}
            </Link>
          </div>
        </form>
      </AdminCard>

      {error ? <p className="admin-alert-error">{error.message}</p> : null}
      {(data?.length ?? 0) > LIMIT ? <p className="admin-alert-warn">{t.auditTruncated}</p> : null}

      {rows.length === 0 ? (
        <p className="text-[15px] text-[var(--muted)]">{t.auditEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const action = r.action as keyof typeof t.auditActions;
            const changes = auditChanges(r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null);
            return (
              <li key={r.id} className="admin-card space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AdminBadge hue={HUE[action] ?? "neutral"} size="sm">
                    {t.auditActions[action] ?? action}
                  </AdminBadge>
                  <span className="text-[15px] font-semibold">
                    {t.auditEntities[r.entity as keyof typeof t.auditEntities] ?? r.entity}
                  </span>
                  <span className="font-mono text-[13px] text-[var(--muted)]" dir="ltr">
                    #{String(r.entity_id).slice(0, 8)}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--muted)]">
                  {formatDateTimeAr(String(r.created_at))} · {r.actor ? names.get(r.actor) || "—" : "—"}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
                {changes.length > 0 ? (
                  <ul className="divide-y divide-[var(--admin-border)] overflow-hidden rounded-[10px] bg-[var(--fill)] text-[13px]">
                    {changes.slice(0, 12).map((c) => (
                      <li key={c.key} className="flex flex-wrap items-center gap-2 px-3 py-2" dir="ltr">
                        <span className="font-mono text-[var(--muted)]">{c.key}</span>
                        <span className="text-[var(--muted)] line-through">{c.from}</span>
                        <span aria-hidden>→</span>
                        <span className="font-semibold">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
