"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteProductAction, updateProductTestStatusAction } from "./actions";
import type { AdminProductPipelineRow } from "./types";
import { adminAr as a } from "@/locales/admin-ar";
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

function MarginBadge({ row }: { row: AdminProductPipelineRow }) {
  const pct = codMarginPercent(row.price, row.discount_price, row.cost_price);
  if (pct == null) {
    return (
      <span className="rounded-full border border-[var(--accent-muted)] px-2.5 py-1 text-xs text-[var(--muted)]">
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
          ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
          : "bg-amber-500/15 text-amber-900 border border-amber-500/30"
      }`}
      dir="ltr"
    >
      {a.pipeline.marginLabel}: {rounded}%
    </span>
  );
}

function ProductThumb({ row }: { row: AdminProductPipelineRow }) {
  if (row.media_type === "video" || !row.media_url.trim()) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-muted)] bg-[var(--card)] text-xs text-[var(--muted)]">
        {row.media_type === "video" ? "▶" : "—"}
      </div>
    );
  }
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--accent-muted)]">
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
}

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
        className="text-xs font-semibold text-red-700 underline disabled:opacity-50"
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
      {tab === "research" ? (
        <Link
          href={`/admin/products/${row.id}/landing-setup`}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)]"
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
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
          >
            {a.pipeline.markWinner}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(row.id, "failed")}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-900 disabled:opacity-50"
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
        await deleteProductAction(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : a.pipeline.deleteFailed);
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{a.products.title}</h1>
        <Link
          href="/admin/products/new"
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
        >
          {a.products.newProduct}
        </Link>
      </div>

      <div
        className="mt-6 flex flex-wrap gap-2 border-b border-[var(--accent-muted)] pb-3"
        role="tablist"
      >
        {PIPELINE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent-muted)]"
            }`}
          >
            {t.label}
            <span className="ms-2 opacity-80">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--accent-muted)]">
        <table className="min-w-full divide-y divide-[var(--accent-muted)] text-sm">
          <thead className="bg-[var(--card)] text-start text-xs uppercase text-[var(--muted)]">
            <tr>
              {tab === "research" ? (
                <>
                  <th className="px-4 py-3">{a.pipeline.image}</th>
                  <th className="px-4 py-3">{a.products.name}</th>
                  <th className="px-4 py-3">{a.pipeline.priceColumn}</th>
                  <th className="px-4 py-3">{a.pipeline.sourcingType}</th>
                  <th className="px-4 py-3">{a.pipeline.codMargin}</th>
                  <th className="px-4 py-3" />
                </>
              ) : (
                <>
                  <th className="px-4 py-3">{a.products.name}</th>
                  <th className="px-4 py-3">{a.products.slug}</th>
                  <th className="px-4 py-3">{a.products.price}</th>
                  {tab === "ready" ? (
                    <th className="px-4 py-3">{a.pipeline.stage}</th>
                  ) : null}
                  <th className="px-4 py-3" />
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {filtered.map((p) =>
              tab === "research" ? (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <ProductThumb row={p} />
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name_ar}</td>
                  <td className="px-4 py-3 whitespace-nowrap" dir="ltr">
                    {formatPrice(
                      p.discount_price != null ? Number(p.discount_price) : Number(p.price),
                    )}
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
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.name_ar}</td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {formatPrice(
                      p.discount_price != null ? Number(p.discount_price) : Number(p.price),
                    )}
                  </td>
                  {tab === "ready" ? (
                    <td className="px-4 py-3 text-xs">
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

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted)]">{a.pipeline.emptyTab}</p>
      ) : null}
    </div>
  );
}
