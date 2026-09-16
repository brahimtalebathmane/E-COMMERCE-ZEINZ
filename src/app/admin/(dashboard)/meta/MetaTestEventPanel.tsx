"use client";

import { useState, useTransition } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminButton, AdminCard } from "@/components/admin/ui";
import {
  resolveWhatsAppDatasetAction,
  sendMetaTestEventsAction,
  type ResolveWhatsAppDatasetResult,
  type SendMetaTestEventsResult,
} from "./actions";

/**
 * One button that fires two shaped Purchase probes at Meta and reports, on
 * screen, the pixel and test code they went to plus Meta's answer for each.
 * See actions.ts for why both shapes are needed.
 */
export function MetaTestEventPanel() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SendMetaTestEventsResult | null>(null);

  const run = () => {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await sendMetaTestEventsAction());
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };

  return (
    <AdminCard
      title={a.meta.testEventTitle}
      action={
        <AdminButton onClick={run} disabled={pending}>
          {pending ? a.meta.testEventSending : a.meta.testEventSend}
        </AdminButton>
      }
    >
      <p className="text-sm text-[var(--admin-muted)]">{a.meta.testEventHelp}</p>

      {result && !result.ok && (
        <p className="admin-alert-error mt-4">{result.error}</p>
      )}

      {result?.ok && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-[var(--admin-muted)]">
                {a.meta.testEventPixel}:{" "}
              </span>
              <span dir="ltr" className="font-mono">
                {result.pixelId}
              </span>
            </div>
            <div>
              <span className="text-[var(--admin-muted)]">
                {a.meta.testEventCode}:{" "}
              </span>
              <span dir="ltr" className="font-mono">
                {result.testEventCode}
              </span>
            </div>
          </div>

          <ul className="space-y-2">
            {result.results.map((row) => (
              <li
                key={row.shape}
                className="rounded-xl border border-[var(--admin-border)] p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {row.shape === "website"
                      ? a.meta.testEventShapeWebsite
                      : a.meta.testEventShapeChat}
                  </span>
                  <span dir="ltr" className="font-mono text-xs">
                    action_source={row.actionSource} · value={row.value}
                  </span>
                  <span className={row.ok ? "text-emerald-400" : "text-red-400"}>
                    {row.ok ? a.meta.stateSuccess : a.meta.stateFailed}
                  </span>
                </div>
                {row.detail && (
                  <p dir="ltr" className="mt-1 break-all font-mono text-xs text-[var(--admin-muted)]">
                    {row.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <p className="text-sm text-[var(--admin-muted)]">{a.meta.testEventRead}</p>
        </div>
      )}
    </AdminCard>
  );
}

/**
 * A `business_messaging` Purchase cannot be sent to the website pixel — Meta
 * rejects it with subcode 2804132 and names the fix in the error itself: POST
 * to `/{waba-id}/dataset`. This button makes that one call so no one has to
 * run curl or paste a token anywhere.
 */
export function WhatsAppDatasetPanel() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResolveWhatsAppDatasetResult | null>(null);

  const run = () => {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await resolveWhatsAppDatasetAction());
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };

  return (
    <AdminCard
      title={a.meta.datasetTitle}
      action={
        <AdminButton onClick={run} disabled={pending}>
          {pending ? a.meta.datasetFetching : a.meta.datasetFetch}
        </AdminButton>
      }
    >
      <p className="text-sm text-[var(--admin-muted)]">{a.meta.datasetHelp}</p>

      {result && !result.ok && (
        <pre dir="ltr" className="admin-alert-error mt-4 whitespace-pre-wrap break-all">
          {result.error}
        </pre>
      )}

      {result?.ok && (
        <div className="mt-4 space-y-1 text-sm">
          <div>
            <span dir="ltr" className="font-mono">
              {result.datasetId}
            </span>
          </div>
          <p className="text-[var(--admin-muted)]">
            {result.alreadyConfigured ? a.meta.datasetAlready : a.meta.datasetCopyHint}
          </p>
        </div>
      )}
    </AdminCard>
  );
}
