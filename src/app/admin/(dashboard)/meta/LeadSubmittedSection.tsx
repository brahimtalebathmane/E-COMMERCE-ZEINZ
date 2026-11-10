"use client";

import { useState, useTransition } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminButton, AdminCard, AdminKpiTile } from "@/components/admin/ui";
import { leadSubmittedRetryAction, type LeadSubmittedRetryActionResult } from "./actions";

export type LeadSubmittedStatus = {
  enabled: boolean;
  configured: boolean;
  sent7d: number;
  backlogCount: number;
  lastError: { message: string; orderId: string | null } | null;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("ar", { maximumFractionDigits: 0 });

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function LeadSubmittedSection({ status }: { status: LeadSubmittedStatus }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LeadSubmittedRetryActionResult | null>(null);
  const healthy = status.backlogCount === 0;

  return (
    <AdminCard
      title={a.meta.leadSubmittedTitle}
      action={
        <AdminButton
          variant="ghost"
          disabled={pending || healthy || !status.enabled || !status.configured}
          onClick={() =>
            startTransition(async () => {
              try {
                setResult(await leadSubmittedRetryAction());
              } catch (error) {
                setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
              }
            })
          }
        >
          {pending ? a.meta.leadSubmittedRetrying : a.meta.leadSubmittedRetry}
        </AdminButton>
      }
    >
      <p className="text-sm text-[var(--admin-muted)]">{a.meta.leadSubmittedSubtitle}</p>

      {!status.enabled && <p className="admin-alert-error mt-4">{a.meta.leadSubmittedOff}</p>}
      {status.enabled && !status.configured && (
        <p className="admin-alert-error mt-4">{a.meta.leadSubmittedNotConfigured}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AdminKpiTile label={a.meta.leadSubmittedSent7d} value={NUMBER_FORMATTER.format(status.sent7d)} />
        <AdminKpiTile
          label={a.meta.leadSubmittedBacklog}
          value={NUMBER_FORMATTER.format(status.backlogCount)}
          hint={healthy ? a.meta.leadSubmittedHealthy : undefined}
        />
      </div>

      {status.lastError && (
        <div className="mt-4 text-sm">
          <p className="text-[var(--admin-muted)]">{a.meta.leadSubmittedLastError}</p>
          <pre
            dir="ltr"
            className="mt-1 whitespace-pre-wrap break-all rounded-xl border border-[var(--admin-border)] p-3 font-mono text-xs"
          >
            {status.lastError.message}
            {status.lastError.orderId ? `\norder=${status.lastError.orderId}` : ""}
          </pre>
        </div>
      )}

      {result &&
        (result.ok ? (
          <p className="mt-4 text-sm">
            {fill(a.meta.leadSubmittedRetryResult, {
              attempted: NUMBER_FORMATTER.format(result.outcome.attempted),
              sent: NUMBER_FORMATTER.format(result.outcome.sent),
              failed: NUMBER_FORMATTER.format(result.outcome.failed),
              skipped: NUMBER_FORMATTER.format(result.outcome.skipped),
            })}
          </p>
        ) : (
          <pre dir="ltr" className="admin-alert-error mt-4 whitespace-pre-wrap break-all">
            {result.error}
          </pre>
        ))}
    </AdminCard>
  );
}
