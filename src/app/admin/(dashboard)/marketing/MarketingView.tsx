"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSelect,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTextarea,
  AdminTh,
  type StatusHue,
} from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { AudienceType, CampaignRow, CampaignStatus, MarketingData, RecipientRow } from "./data";
import type { RecipientListRow } from "./actions";
import {
  createCampaignAction,
  listCampaignRecipientsAction,
  previewAudienceAction,
  resumeCampaignAction,
  searchCustomersAction,
  sendCampaignAction,
} from "./actions";

const STATUS_HUE: Record<CampaignStatus, StatusHue> = {
  draft: "slate",
  sending: "sky",
  completed: "emerald",
  failed: "red",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: a.marketing.statusDraft,
  sending: a.marketing.statusSending,
  completed: a.marketing.statusCompleted,
  failed: a.marketing.statusFailed,
};

const AUDIENCE_LABEL: Record<AudienceType, string> = {
  all_confirmed: a.marketing.audienceAllConfirmed,
  by_product: a.marketing.audienceByProduct,
  manual: a.marketing.audienceManual,
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FORMATTER.format(d);
}

function SenderStatusBadge() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(() => {
    setChecking(true);
    fetch("/api/admin/marketing-sender-status", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { connected?: boolean }) => setConnected(Boolean(json.connected)))
      .catch(() => setConnected(false))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[var(--muted)]">{a.marketing.senderStatusLabel}</span>
      {checking ? (
        <AdminBadge hue="slate" size="sm">…</AdminBadge>
      ) : connected ? (
        <AdminBadge hue="emerald" size="sm">{a.marketing.senderConnected}</AdminBadge>
      ) : (
        <AdminBadge hue="red" size="sm">{a.marketing.senderDisconnected}</AdminBadge>
      )}
      <button
        type="button"
        onClick={check}
        aria-label="↻"
        className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
      >
        ↻
      </button>
    </div>
  );
}

export function MarketingView({ data }: { data: MarketingData }) {
  const router = useRouter();

  const [messageText, setMessageText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [audienceType, setAudienceType] = useState<AudienceType>("all_confirmed");
  const [productId, setProductId] = useState<string>("");

  const [previewRecipients, setPreviewRecipients] = useState<RecipientRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [manualSearch, setManualSearch] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<RecipientRow[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSelected, setManualSelected] = useState<RecipientRow[]>([]);

  const [senderConnected, setSenderConnected] = useState<boolean | null>(null);

  const [creating, setCreating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [recipientRows, setRecipientRows] = useState<RecipientListRow[] | null>(null);
  const [recipientRowsLoading, setRecipientRowsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/marketing-sender-status", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { connected?: boolean }) => setSenderConnected(Boolean(json.connected)))
      .catch(() => setSenderConnected(false));
  }, []);

  const recipientCount =
    audienceType === "manual" ? manualSelected.length : previewRecipients?.length ?? null;

  useEffect(() => {
    if (audienceType === "manual") {
      setPreviewRecipients(null);
      return;
    }
    if (audienceType === "by_product" && !productId) {
      setPreviewRecipients(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    previewAudienceAction(audienceType, audienceType === "by_product" ? productId : null)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setPreviewRecipients(res.recipients);
        else {
          setPreviewRecipients(null);
          toast.error(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audienceType, productId]);

  async function onManualSearch() {
    setManualSearching(true);
    try {
      const res = await searchCustomersAction(manualSearch);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setManualSearchResults(res.recipients);
    } finally {
      setManualSearching(false);
    }
  }

  function addManualRecipient(recipient: RecipientRow) {
    setManualSelected((prev) => {
      if (prev.some((r) => r.phone === recipient.phone)) return prev;
      return [...prev, recipient];
    });
  }

  function removeManualRecipient(phone: string) {
    setManualSelected((prev) => prev.filter((r) => r.phone !== phone));
  }

  async function onImageChange(file: File | null) {
    if (!file) return;
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "marketing");
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const json = (await res.json()) as { signedUrl?: string; error?: string };
      if (!res.ok || !json.signedUrl) throw new Error(json.error || a.marketing.imageUploadError);
      setImageUrl(json.signedUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.marketing.imageUploadError);
    } finally {
      setImageUploading(false);
    }
  }

  const canSend =
    messageText.trim().length > 0 &&
    Boolean(recipientCount && recipientCount > 0) &&
    (audienceType !== "by_product" || Boolean(productId)) &&
    senderConnected === true &&
    !creating;

  async function onConfirmSend() {
    setConfirmOpen(false);
    setCreating(true);
    try {
      const createRes = await createCampaignAction({
        messageText,
        imageUrl,
        audienceType,
        productId: audienceType === "by_product" ? productId : null,
        manualRecipients: audienceType === "manual" ? manualSelected : undefined,
      });
      if (!createRes.ok) {
        toast.error(createRes.error);
        return;
      }
      const sendRes = await sendCampaignAction(createRes.campaignId);
      if (!sendRes.ok) {
        toast.error(sendRes.error);
        return;
      }
      toast.success(a.marketing.sendSuccess);
      setMessageText("");
      setImageUrl(null);
      setManualSelected([]);
      setManualSearchResults([]);
      setProductId("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.marketing.sendError);
    } finally {
      setCreating(false);
    }
  }

  async function onResume(campaignId: string) {
    setResumingId(campaignId);
    try {
      const res = await resumeCampaignAction(campaignId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    } finally {
      setResumingId(null);
    }
  }

  async function onOpenRecipients(campaignId: string) {
    setActiveCampaignId(campaignId);
    setRecipientRows(null);
    setRecipientRowsLoading(true);
    try {
      const res = await listCampaignRecipientsAction(campaignId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRecipientRows(res.recipients);
    } finally {
      setRecipientRowsLoading(false);
    }
  }

  const activeCampaign = useMemo(
    () => data.campaigns.find((c) => c.id === activeCampaignId) ?? null,
    [data.campaigns, activeCampaignId],
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader title={a.marketing.title} subtitle={a.marketing.subtitle} actions={<SenderStatusBadge />} />

      {senderConnected === false ? (
        <p className="admin-alert-error">{a.marketing.senderOfflineWarning}</p>
      ) : null}

      <AdminCard className="space-y-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">{a.marketing.newCampaign}</h2>

        <AdminTextarea
          label={a.marketing.messageText}
          placeholder={a.marketing.messageTextPlaceholder}
          rows={5}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
        />

        <div className="space-y-2">
          <span className="text-xs font-semibold text-[var(--foreground)]">{a.marketing.image}</span>
          {imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <AdminButton type="button" variant="ghost" onClick={() => setImageUrl(null)}>
                {a.marketing.removeImage}
              </AdminButton>
            </div>
          ) : (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={imageUploading}
              onChange={(e) => void onImageChange(e.target.files?.[0] ?? null)}
              className="admin-input"
            />
          )}
          {imageUploading ? <p className="text-xs text-[var(--muted)]">{a.marketing.uploadingImage}</p> : null}
        </div>

        <div className="space-y-3">
          <span className="text-xs font-semibold text-[var(--foreground)]">{a.marketing.audienceType}</span>
          <div className="flex flex-wrap gap-2">
            {(["all_confirmed", "by_product", "manual"] as AudienceType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAudienceType(type)}
                className={`admin-tab-pill ${audienceType === type ? "" : ""}`}
                data-active={audienceType === type}
              >
                {AUDIENCE_LABEL[type]}
              </button>
            ))}
          </div>

          {audienceType === "by_product" ? (
            <AdminSelect value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{a.marketing.selectProduct}</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </AdminSelect>
          ) : null}

          {audienceType === "manual" ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onManualSearch();
                    }
                  }}
                  placeholder={a.marketing.searchCustomers}
                  className="admin-input flex-1"
                />
                <AdminButton type="button" variant="ghost" disabled={manualSearching} onClick={() => void onManualSearch()}>
                  {manualSearching ? a.marketing.searching : a.marketing.searchCustomers}
                </AdminButton>
              </div>

              {manualSearchResults.length > 0 ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--admin-border)] p-2">
                  {manualSearchResults.map((r) => {
                    const alreadyAdded = manualSelected.some((s) => s.phone === r.phone);
                    return (
                      <li key={r.phone} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate">
                          {r.customerName ?? "—"} <span className="text-[var(--muted)]" dir="ltr">{r.phone}</span>
                        </span>
                        <button
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => addManualRecipient(r)}
                          className="shrink-0 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {alreadyAdded ? a.marketing.added : a.marketing.addCustomer}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {manualSelected.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {a.marketing.manualSelectedTitle}
                  </p>
                  <ul className="mt-2 space-y-1 rounded-xl border border-[var(--admin-border)] p-2">
                    {manualSelected.map((r) => (
                      <li key={r.phone} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate">
                          {r.customerName ?? "—"} <span className="text-[var(--muted)]" dir="ltr">{r.phone}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeManualRecipient(r.phone)}
                          className="shrink-0 text-xs font-semibold text-red-300 underline-offset-2 hover:underline"
                        >
                          {a.marketing.removeRecipient}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-sm font-medium text-[var(--foreground)]">
            {previewLoading
              ? a.marketing.loadingRecipients
              : recipientCount !== null
                ? a.marketing.recipientCount.replace("{count}", String(recipientCount))
                : ""}
          </p>
          {!previewLoading && recipientCount === 0 ? (
            <p className="text-xs text-[var(--muted)]">{a.marketing.noRecipients}</p>
          ) : null}
        </div>

        <div className="border-t border-[var(--admin-border)] pt-4">
          <AdminButton type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
            {creating ? a.marketing.sending : a.marketing.send}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden" noPadding>
        <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-[var(--foreground)]">{a.marketing.historyTitle}</h2>
        </div>
        {data.campaigns.length === 0 ? (
          <AdminEmptyState title={a.marketing.historyEmpty} />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <AdminTableRow>
                <AdminTh>{a.marketing.colDate}</AdminTh>
                <AdminTh>{a.marketing.colAudience}</AdminTh>
                <AdminTh>{a.marketing.colStatus}</AdminTh>
                <AdminTh align="end">{a.marketing.colRecipients}</AdminTh>
                <AdminTh align="end">{a.marketing.colSent}</AdminTh>
                <AdminTh align="end">{a.marketing.colFailed}</AdminTh>
                <AdminTh align="end">{a.orders.actions}</AdminTh>
              </AdminTableRow>
            </AdminTableHead>
            <AdminTableBody>
              {data.campaigns.map((c: CampaignRow) => (
                <AdminTableRow key={c.id}>
                  <AdminTd>{formatDate(c.createdAt)}</AdminTd>
                  <AdminTd>{AUDIENCE_LABEL[c.audienceType]}</AdminTd>
                  <AdminTd>
                    <AdminBadge hue={STATUS_HUE[c.status]} size="sm">
                      {STATUS_LABEL[c.status]}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd align="end" mono>{c.totalRecipients}</AdminTd>
                  <AdminTd align="end" mono>{c.sentCount}</AdminTd>
                  <AdminTd align="end" mono>{c.failedCount}</AdminTd>
                  <AdminTd align="end">
                    <div className="flex items-center justify-end gap-2">
                      {c.status === "failed" ? (
                        <button
                          type="button"
                          disabled={resumingId === c.id}
                          onClick={() => void onResume(c.id)}
                          className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-60"
                        >
                          {resumingId === c.id ? a.marketing.resuming : a.marketing.resume}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void onOpenRecipients(c.id)}
                        className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {a.marketing.recipientsListTitle}
                      </button>
                    </div>
                  </AdminTd>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCard>

      <ConfirmDialog
        open={confirmOpen}
        title={a.marketing.sendConfirmTitle}
        message={a.marketing.sendConfirm.replace("{count}", String(recipientCount ?? 0))}
        confirmLabel={a.marketing.send}
        cancelLabel={a.orders.cancel}
        onConfirm={() => void onConfirmSend()}
        onCancel={() => setConfirmOpen(false)}
      />

      {activeCampaign ? (
        <RecipientsDrawer
          campaign={activeCampaign}
          rows={recipientRows}
          loading={recipientRowsLoading}
          onClose={() => {
            setActiveCampaignId(null);
            setRecipientRows(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RecipientsDrawer({
  campaign,
  rows,
  loading,
  onClose,
}: {
  campaign: CampaignRow;
  rows: RecipientListRow[] | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="admin-shell fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" dir="rtl" lang="ar">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-label={a.marketing.close} />
      <div className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-elevated)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] sm:max-h-[85vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{a.marketing.recipientsListTitle}</h2>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {AUDIENCE_LABEL[campaign.audienceType]} · {STATUS_LABEL[campaign.status]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[40px] shrink-0 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-3 py-2 text-sm font-medium">
            {a.marketing.close}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading || !rows ? (
            <p className="text-sm text-[var(--muted)]">…</p>
          ) : rows.length === 0 ? (
            <AdminEmptyState title={a.marketing.historyEmpty} />
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--admin-border)] px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {r.customerName ?? "—"} <span className="text-[var(--muted)]" dir="ltr">{r.phone}</span>
                  </span>
                  <AdminBadge
                    hue={r.status === "sent" ? "emerald" : r.status === "failed" ? "red" : "slate"}
                    size="sm"
                  >
                    {r.status === "sent"
                      ? a.marketing.recipientStatusSent
                      : r.status === "failed"
                        ? a.marketing.recipientStatusFailed
                        : a.marketing.recipientStatusPending}
                  </AdminBadge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
