"use client";

import { useMemo, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminButton } from "@/components/admin/ui/AdminButton";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminKpiTile } from "@/components/admin/ui/AdminKpiTile";
import type { MetaOverviewStats } from "./types";

const OPS_TIME_ZONE = "Africa/Nouakchott";

const TIME_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: OPS_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : TIME_FORMATTER.format(date);
}

type Props = {
  overview: MetaOverviewStats;
};

export function MetaOverviewSection({ overview }: Props) {
  const [healthStatus, setHealthStatus] = useState<{
    loading: boolean;
    ok: boolean | null;
    message: string | null;
  }>({ loading: false, ok: null, message: null });

  const dispatchEventTypes = useMemo(
    () => ["lead", "purchase", "cancelled_lead", "initiate_checkout"],
    [],
  );

  const checkHealth = async () => {
    setHealthStatus({ loading: true, ok: null, message: null });
    try {
      const res = await fetch("/api/meta/health");
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string | null;
        hints?: string[];
      };
      setHealthStatus({
        loading: false,
        ok: Boolean(json.ok),
        message:
          json.error ??
          json.hints?.[0] ??
          (json.ok ? a.meta.healthOk : a.meta.healthFail),
      });
    } catch {
      setHealthStatus({
        loading: false,
        ok: false,
        message: a.meta.healthFetchError,
      });
    }
  };

  return (
    <AdminCard>
      <h2 className="admin-section-title">{a.meta.overviewTitle}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{a.meta.overviewSubtitle}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiTile
          label={a.meta.failures24h}
          value={String(overview.failures24h)}
          accent="var(--status-red)"
        />
        <AdminKpiTile
          label={a.meta.skips24h}
          value={String(overview.skips24h)}
          accent="var(--status-amber)"
        />
        <AdminKpiTile
          label={a.meta.successes24h}
          value={String(overview.successes24h)}
          accent="var(--status-emerald)"
        />
        <AdminKpiTile
          label={a.meta.stuckNow}
          value={String(overview.stuckCount)}
          accent="#fb923c"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AdminButton variant="ghost" onClick={() => void checkHealth()} disabled={healthStatus.loading}>
          {healthStatus.loading ? a.meta.checkingHealth : a.meta.checkHealth}
        </AdminButton>
        {healthStatus.ok != null ? (
          <span
            className={`text-sm font-medium ${healthStatus.ok ? "text-emerald-300" : "text-red-300"}`}
          >
            {healthStatus.message}
          </span>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[var(--admin-border)] pt-4">
        <p className="text-sm font-semibold text-[var(--foreground)]">{a.meta.lastSuccessTitle}</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {dispatchEventTypes.map((type) => (
            <li
              key={type}
              className="flex justify-between gap-2 border-b border-[var(--admin-border)] py-2"
            >
              <span className="text-[var(--foreground)]">
                {a.meta.eventTypes[type as keyof typeof a.meta.eventTypes] ?? type}
              </span>
              <span className="font-mono text-xs text-[var(--muted)]" dir="ltr">
                {formatTime(overview.lastSuccessByType[type])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </AdminCard>
  );
}

export function MetaOverviewSkeleton() {
  return (
    <section className="admin-card p-4 sm:p-5" aria-busy="true">
      <div className="admin-skeleton h-6 w-40" />
      <div className="admin-skeleton mt-2 h-4 w-64 max-w-full" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-skeleton h-20 rounded-xl" />
        ))}
      </div>
    </section>
  );
}
