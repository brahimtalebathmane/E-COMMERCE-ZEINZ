"use client";

import { useState, useTransition } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminButton, AdminCard, AdminKpiTile } from "@/components/admin/ui";
import {
  datasetGapDryRunAction,
  datasetGapResendAction,
  type DatasetResendActionResult,
} from "./actions";
import type {
  DatasetGapStatus,
  WhatsAppSignalCoverage,
  WhatsAppSignalCoverageWindow,
} from "./types";

const NUMBER_FORMATTER = new Intl.NumberFormat("ar", { maximumFractionDigits: 0 });
const DATE_FORMATTER = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCount(value: number): string {
  return NUMBER_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? DATE_FORMATTER.format(ms) : iso;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function RunOutcome({ result }: { result: DatasetResendActionResult }) {
  if (!result.ok) {
    return (
      <pre dir="ltr" className="admin-alert-error mt-4 whitespace-pre-wrap break-all">
        {result.error}
      </pre>
    );
  }
  const o = result.outcome;
  return (
    <div className="mt-4 space-y-1 rounded-xl border border-[var(--admin-border)] p-3 text-sm">
      <p>{fill(a.meta.gapDryRunResult, { eligible: formatCount(o.eligible), expired: formatCount(o.expired) })}</p>
      <p className="text-[var(--admin-muted)]">
        {a.meta.gapOldest}: {formatDate(o.oldest)} · {a.meta.gapNewest}: {formatDate(o.newest)}
      </p>
      {!o.dryRun && (
        <p>
          {fill(a.meta.gapRunResult, {
            accepted: formatCount(o.accepted),
            rejected: formatCount(o.rejected),
            skipped: formatCount(o.skipped),
            remaining: formatCount(o.remaining),
          })}
          {o.firstSubcode != null && (
            <>
              {" · "}
              {a.meta.gapFirstSubcode}:{" "}
              <span dir="ltr" className="font-mono">
                {o.firstSubcode}
              </span>
            </>
          )}
        </p>
      )}
      {o.firstError && (
        <p dir="ltr" className="break-all font-mono text-xs text-[var(--admin-muted)]">
          {o.firstError}
        </p>
      )}
      {o.stoppedReason && (
        <p className="text-amber-500">
          {a.meta.gapStopped} {a.meta.gapStopReasons[o.stoppedReason]}
        </p>
      )}
    </div>
  );
}

export function DatasetGapSection({ status }: { status: DatasetGapStatus }) {
  const [pending, startTransition] = useTransition();
  const [dryRun, setDryRun] = useState<DatasetResendActionResult | null>(null);
  const [run, setRun] = useState<DatasetResendActionResult | null>(null);
  const [busy, setBusy] = useState<"dry" | "resend" | null>(null);

  const call = (
    which: "dry" | "resend",
    action: () => Promise<DatasetResendActionResult>,
    set: (r: DatasetResendActionResult) => void,
  ) => {
    setBusy(which);
    startTransition(async () => {
      try {
        set(await action());
      } catch (error) {
        set({ ok: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(null);
      }
    });
  };

  // Resend is only offered once a dry run in this page session has shown what
  // it would send.
  const dryRunDone = dryRun?.ok === true;
  const healthy = status.eligible === 0;

  return (
    <AdminCard
      title={a.meta.gapTitle}
      action={
        <div className="flex flex-wrap gap-2">
          <AdminButton
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setRun(null);
              call("dry", datasetGapDryRunAction, setDryRun);
            }}
          >
            {pending && busy === "dry" ? a.meta.gapDryRunning : a.meta.gapDryRun}
          </AdminButton>
          <AdminButton
            disabled={pending || !dryRunDone || !status.configured}
            title={dryRunDone ? undefined : a.meta.gapResendNeedsDryRun}
            onClick={() => call("resend", datasetGapResendAction, setRun)}
          >
            {pending && busy === "resend" ? a.meta.gapResending : a.meta.gapResend}
          </AdminButton>
        </div>
      }
    >
      <p className="text-sm text-[var(--admin-muted)]">{a.meta.gapSubtitle}</p>

      {!status.configured && <p className="admin-alert-error mt-4">{a.meta.gapNotConfigured}</p>}

      <div
        className={`mt-4 rounded-xl border p-4 ${
          healthy ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/40 bg-red-400/10"
        }`}
      >
        <p className="text-sm text-[var(--admin-muted)]">{a.meta.gapEligible}</p>
        <p className={`mt-1 text-4xl font-bold ${healthy ? "text-emerald-400" : "text-red-400"}`}>
          {formatCount(status.eligible)}
        </p>
        <p className="mt-2 text-sm">{healthy ? a.meta.gapHealthy : a.meta.gapUnhealthy}</p>
        {!healthy && (
          <p className="mt-1 text-xs text-[var(--admin-muted)]">
            {a.meta.gapOldest}: {formatDate(status.oldest)} · {a.meta.gapNewest}: {formatDate(status.newest)}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <AdminKpiTile
          label={fill(a.meta.gapExpired, { days: status.lookbackDays })}
          value={formatCount(status.expired)}
        />
        <AdminKpiTile
          label={a.meta.gapLastRun}
          value={status.lastRun ? formatDate(status.lastRun.at) : "—"}
          hint={status.lastRun ? (status.lastRun.detail ?? status.lastRun.state) : a.meta.gapLastRunNone}
        />
      </div>

      <div className="mt-4 text-sm">
        <p className="text-[var(--admin-muted)]">{a.meta.gapLastError}</p>
        {status.lastError ? (
          <pre dir="ltr" className="mt-1 whitespace-pre-wrap break-all rounded-xl border border-[var(--admin-border)] p-3 font-mono text-xs">
            {status.lastError.message}
            {"\n"}order={status.lastError.orderId}
          </pre>
        ) : (
          <p className="mt-1">{a.meta.gapLastErrorNone}</p>
        )}
      </div>

      <p className="mt-4 text-xs text-[var(--admin-muted)]">{a.meta.gapPixelOnly}</p>

      {dryRun && <RunOutcome result={dryRun} />}
      {run && <RunOutcome result={run} />}
    </AdminCard>
  );
}

function CoverageRow({ window: w }: { window: WhatsAppSignalCoverageWindow }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{fill(a.meta.coverageWindow, { days: w.days })}</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminKpiTile label={a.meta.coveragePurchases} value={formatCount(w.purchases)} />
        <AdminKpiTile label={a.meta.coverageAttributable} value={formatCount(w.attributable)} />
        <AdminKpiTile label={a.meta.coveragePercent} value={percent(w.attributable, w.purchases)} />
        <AdminKpiTile
          label={a.meta.coverageReached}
          value={formatCount(w.reachedDataset)}
          hint={percent(w.reachedDataset, w.attributable)}
        />
      </div>
    </div>
  );
}

export function SignalCoverageSection({ coverage }: { coverage: WhatsAppSignalCoverage }) {
  return (
    <AdminCard title={a.meta.coverageTitle}>
      <p className="text-sm text-[var(--admin-muted)]">{a.meta.coverageSubtitle}</p>
      <div className="mt-4 space-y-4">
        <CoverageRow window={coverage.last30} />
        <CoverageRow window={coverage.last7} />
      </div>
      {coverage.truncated && <p className="mt-3 text-xs text-amber-500">{a.meta.coverageTruncated}</p>}
    </AdminCard>
  );
}
