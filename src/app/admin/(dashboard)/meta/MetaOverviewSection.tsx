"use client";

import { useMemo, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
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
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{a.meta.overviewTitle}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{a.meta.overviewSubtitle}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{a.meta.failures24h}</p>
          <p className="text-2xl font-semibold text-red-900">{overview.failures24h}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">{a.meta.skips24h}</p>
          <p className="text-2xl font-semibold text-amber-900">{overview.skips24h}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-700">{a.meta.successes24h}</p>
          <p className="text-2xl font-semibold text-emerald-900">{overview.successes24h}</p>
        </div>
        <div className="rounded-lg bg-orange-50 px-3 py-2">
          <p className="text-xs text-orange-700">{a.meta.stuckNow}</p>
          <p className="text-2xl font-semibold text-orange-900">{overview.stuckCount}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void checkHealth()}
          disabled={healthStatus.loading}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-60"
        >
          {healthStatus.loading ? a.meta.checkingHealth : a.meta.checkHealth}
        </button>
        {healthStatus.ok != null && (
          <span
            className={`text-sm font-medium ${healthStatus.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {healthStatus.message}
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium">{a.meta.lastSuccessTitle}</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {dispatchEventTypes.map((type) => (
            <li
              key={type}
              className="flex justify-between gap-2 border-b border-[var(--border)] py-1"
            >
              <span>
                {a.meta.eventTypes[type as keyof typeof a.meta.eventTypes] ?? type}
              </span>
              <span className="text-[var(--muted)]">
                {formatTime(overview.lastSuccessByType[type])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MetaOverviewSkeleton() {
  return (
    <section
      className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5"
      aria-busy="true"
    >
      <div className="h-6 w-40 rounded bg-white/[0.06]" />
      <div className="mt-2 h-4 w-64 max-w-full rounded bg-white/[0.04]" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </section>
  );
}
