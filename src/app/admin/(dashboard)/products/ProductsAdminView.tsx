"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState, useTransition } from "react";
import { deleteProductAction, updateProductTestStatusAction } from "./actions";
import type { AdminProductPipelineRow } from "./types";
import { adminAr as a } from "@/locales/admin-ar";
import { PlusIcon } from "@/components/admin/AdminIcons";
import { formatPrice } from "@/lib/currency";
import {
  PIPELINE_TABS,
  codMarginPercent,
  filterProductsByTab,
  sourcingTypeLabel,
  type PipelineTabId,
} from "@/lib/product-pipeline";
import type { ProductTestingStatus } from "@/types";

type Props = {
  products: AdminProductPipelineRow[];
};

/**
 * Rows committed on first paint and per follow-up chunk. Keeps tab switching
 * instant even when a pipeline stage holds hundreds of products: the first
 * page renders synchronously, the remainder streams in idle frames.
 */
const INITIAL_RENDER = 40;
const RENDER_CHUNK = 40;

const MarginBadge = memo(function MarginBadge({
  row,
}: {
  row: AdminProductPipelineRow;
}) {
  const pct = codMarginPercent(row.price, row.discount_price, row.cost_price);
  if (pct == null) {
    return (
      <span className="rounded-full border border-[var(--admin-border-strong)] px-2.5 py-1 text-xs text-[var(--muted)]">
        {a.pipeline.marginUnset}
      </span>
    );
  }
  const rounded = Math.round(pct * 10) / 10;
  const good = rounded > 60;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        good
          ? "bg-emerald-400/10 text-emerald-300 border border-emerald-400/30"
          : "bg-amber-400/10 text-amber-300 border border-amber-400/30"
      }`}
      dir="ltr"
    >
      {a.pipeline.marginLabel}: {rounded}%
    </span>
  );
});

const ProductThumb = memo(function ProductThumb({
  row,
}: {
  row: AdminProductPipelineRow;
}) {
  if (row.media_type === "video" || !row.media_url.trim()) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] text-xs text-[var(--muted)]">
        {row.media_type === "video" ? "▶" : "—"}
      </div>
    );
  }
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--admin-border)]">
      <Image
        src={row.media_url}
        alt=""
        fill
        className="object-cover"
        sizes="56px"
        unoptimized
      />
    </div>
  );
});

function EditDeleteActions({
  row,
  busy,
  deletingId,
  onDelete,
}: {
  row: AdminProductPipelineRow;
  busy: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
}) {
  const isDeleting = deletingId === row.id;
  return (
    <>
      <Link
        href={`/admin/products/${row.id}/edit`}
        className="text-[var(--accent)] underline text-xs"
      >
        {a.products.edit}
      </Link>
      <span className="text-[var(--muted)]">·</span>
      <button
        type="button"
        disabled={busy || isDeleting}
        onClick={() => onDelete(row.id)}
        className="text-xs font-semibold text-red-400 underline disabled:opacity-50"
      >
        {isDeleting ? a.pipeline.deleting : a.pipeline.delete}
      </button>
    </>
  );
}

function PipelineActions({
  row,
  tab,
  busy,
  deletingId,
  onStatus,
  onDelete,
}: {
  row: AdminProductPipelineRow;
  tab: PipelineTabId;
  busy: boolean;
  deletingId: string | null;
  onStatus: (id: string, status: ProductTestingStatus) => void;
  onDelete: (id: string) => void;
}) {
  const canViewLanding = Boolean(row.slug) && row.test_status !== "failed";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {tab === "research" || tab === "ready" ? (
        <Link
          href={
            tab === "research"
              ? `/admin/products/${row.id}/landing-setup`
              : `/admin/products/${row.id}/edit`
          }
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] transition hover:brightness-110"
        >
          {a.pipeline.setupLanding}
        </Link>
      ) : null}
      {tab === "ready" ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(row.id, "winner")}
            className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {a.pipeline.markWinner}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(row.id, "failed")}
            className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
          >
            {a.pipeline.markFailed}
          </button>
        </>
      ) : null}
      {canViewLanding ? (
        <Link
          href={`/${row.slug}`}
          className="text-[var(--muted)] underline text-xs"
          target="_blank"
          rel="noopener noreferrer"
        >
          {a.products.view}
        </Link>
      ) : null}
      <EditDeleteActions row={row} busy={busy} deletingId={deletingId} onDelete={onDelete} />
    </div>
  );
}

export function ProductsAdminView({ products }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<PipelineTabId>("research");
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterProductsByTab(products, tab),
    [products, tab],
  );

  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);

  useEffect(() => {
    setRenderCount(Math.min(INITIAL_RENDER, filtered.length));
  }, [filtered]);

  useEffect(() => {
    if (renderCount >= filtered.length) return;
    const id = requestAnimationFrame(() => {
      setRenderCount((c) => Math.min(filtered.length, c + RENDER_CHUNK));
    });
    return () => cancelAnimationFrame(id);
  }, [renderCount, filtered.length]);

  const visible =
    filtered.length <= renderCount ? filtered : filtered.slice(0, renderCount);

  const counts = useMemo(() => {
    const c: Record<PipelineTabId, number> = {
      research: 0,
      ready: 0,
      winner: 0,
      failed: 0,
    };
    for (const p of products) {
      if (p.test_status === "under_research") c.research += 1;
      else if (p.test_status === "ready_for_test" || p.test_status === "testing")
        c.ready += 1;
      else if (p.test_status === "winner") c.winner += 1;
      else if (p.test_status === "failed") c.failed += 1;
    }
    return c;
  }, [products]);

  function handleStatus(id: string, status: ProductTestingStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await updateProductTestStatusAction(id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : a.pipeline.statusUpdateFailed);
      }
    });
  }

  function handleDelete(id: string) {
    if (deletingId) return;
    if (!confirm(a.pipeline.deleteConfirm)) return;
    setError(null);
    setDeletingId(id);
    startTransition(async () => {
      try {
        const result = await deleteProductAction(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : a.pipeline.deleteFailed);
      } finally {
        setDeletingId(null);
      }
    });
  }

  const price = (p: AdminProductPipelineRow) =>
    formatPrice(p.discount_price != null ? Number(p.discount_price) : Number(p.price));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{a.products.title}</h1>
        </div>
        <Link href="/admin/products/new" className="admin-btn-primary">
          <PlusIcon size={18} />
          {a.products.newProduct}
        </Link>
      </div>

      <div
        className="mt-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
        role="tablist"
      >
        {PIPELINE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_8px_20px_-8px_rgba(31,170,80,0.6)]"
                : "border-[var(--admin-border-strong)] bg-white/[0.02] text-[var(--foreground)] hover:bg-white/[0.06]"
            }`}
          >
            {t.label}
            <span
              className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${
                tab === t.id ? "bg-white/20" : "bg-white/[0.06] text-[var(--muted)]"
              }`}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[var(--muted)]">{a.pipeline.emptyTab}</p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="mt-5 grid gap-3 md:hidden">
            {visible.map((p) => (
              <div key={p.id} className="admin-card p-4">
                <div className="flex gap-3">
                  <ProductThumb row={p} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--foreground)]">{p.name_ar}</p>
                    {tab === "research" ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {sourcingTypeLabel(p.sourcing_type)}
                      </p>
                    ) : (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted)]" dir="ltr">
                        {p.slug}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-[var(--foreground)]" dir="ltr">
                        {price(p)}
                      </span>
                      {tab === "research" ? <MarginBadge row={p} /> : null}
                      {tab === "ready" ? (
                        <span className="rounded-full border border-[var(--admin-border-strong)] px-2.5 py-1 text-[11px] text-[var(--muted)]">
                          {p.test_status === "testing"
                            ? a.pipeline.statusTesting
                            : a.pipeline.statusReady}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 border-t border-[var(--admin-border)] pt-3">
                  <PipelineActions
                    row={p}
                    tab={tab}
                    busy={pending}
                    deletingId={deletingId}
                    onStatus={handleStatus}
                    onDelete={handleDelete}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="admin-card mt-5 hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--admin-border)] text-sm">
                <thead className="bg-white/[0.02] text-start text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    {tab === "research" ? (
                      <>
                        <th className="px-4 py-3 text-start">{a.pipeline.image}</th>
                        <th className="px-4 py-3 text-start">{a.products.name}</th>
                        <th className="px-4 py-3 text-start">{a.pipeline.priceColumn}</th>
                        <th className="px-4 py-3 text-start">{a.pipeline.sourcingType}</th>
                        <th className="px-4 py-3 text-start">{a.pipeline.codMargin}</th>
                        <th className="px-4 py-3" />
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-start">{a.products.name}</th>
                        <th className="px-4 py-3 text-start">{a.products.slug}</th>
                        <th className="px-4 py-3 text-start">{a.products.price}</th>
                        {tab === "ready" ? (
                          <th className="px-4 py-3 text-start">{a.pipeline.stage}</th>
                        ) : null}
                        <th className="px-4 py-3" />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  {visible.map((p) =>
                    tab === "research" ? (
                      <tr key={p.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <ProductThumb row={p} />
                        </td>
                        <td className="px-4 py-3 font-medium">{p.name_ar}</td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums" dir="ltr">
                          {price(p)}
                        </td>
                        <td className="px-4 py-3">{sourcingTypeLabel(p.sourcing_type)}</td>
                        <td className="px-4 py-3">
                          <MarginBadge row={p} />
                        </td>
                        <td className="px-4 py-3 text-end">
                          <PipelineActions
                            row={p}
                            tab={tab}
                            busy={pending}
                            deletingId={deletingId}
                            onStatus={handleStatus}
                            onDelete={handleDelete}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium">{p.name_ar}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]" dir="ltr">
                          {p.slug}
                        </td>
                        <td className="px-4 py-3 tabular-nums" dir="ltr">
                          {price(p)}
                        </td>
                        {tab === "ready" ? (
                          <td className="px-4 py-3 text-xs text-[var(--muted)]">
                            {p.test_status === "testing"
                              ? a.pipeline.statusTesting
                              : a.pipeline.statusReady}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-end">
                          <PipelineActions
                            row={p}
                            tab={tab}
                            busy={pending}
                            deletingId={deletingId}
                            onStatus={handleStatus}
                            onDelete={handleDelete}
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
