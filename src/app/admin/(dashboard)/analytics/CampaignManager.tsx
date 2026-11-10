"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminBadge } from "@/components/admin/ui";
import {
  linkAdCampaignAction,
  linkAdSetAction,
  listActiveAdSetsAction,
  unlinkAdCampaignAction,
  unlinkAdSetAction,
  type ActiveAdSetOption,
} from "./actions";
import type { LinkedCampaign } from "./data";

/**
 * Link / unlink Meta campaigns and ad sets to one product so its ad spend is
 * pulled live from the Marketing API. A campaign is linked EITHER whole or
 * through its ad sets (one ad set per product), never both — the server and
 * the database refuse the mix. Shared by the owned (MRU) dashboard and the
 * affiliate section; the actions reject products outside the selected country.
 *
 * Phone first: 44pt touch targets, 16px inputs (no iOS zoom), one column.
 */
export function CampaignManager({
  productId,
  initialCampaigns,
  onChanged,
}: {
  productId: string;
  initialCampaigns: LinkedCampaign[];
  onChanged: () => void;
}) {
  const [links, setLinks] = useState(initialCampaigns);
  const [busy, setBusy] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const [campaignDraft, setCampaignDraft] = useState("");
  const [adSetDraft, setAdSetDraft] = useState("");
  const [showManualAdSet, setShowManualAdSet] = useState(false);

  const [options, setOptions] = useState<ActiveAdSetOption[] | null>(null);
  const [optionsTruncated, setOptionsTruncated] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [search, setSearch] = useState("");

  const adSets = links.filter((l) => l.kind === "adset");
  const campaigns = links.filter((l) => l.kind === "campaign");

  const filteredOptions = useMemo(() => {
    if (!options) return [];
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.campaignName ?? "").toLowerCase().includes(q) ||
        o.id.includes(q) ||
        o.campaignId.includes(q),
    );
  }, [options, search]);

  async function loadOptions() {
    if (loadingOptions) return;
    setLoadingOptions(true);
    try {
      const res = await listActiveAdSetsAction();
      if (!res.ok) throw new Error(res.error);
      setOptions(res.adSets);
      setOptionsTruncated(res.truncated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.adSetListFailed);
    } finally {
      setLoadingOptions(false);
    }
  }

  async function onLinkAdSet(adSetId: string) {
    const id = adSetId.trim();
    if (!id || busy) return;
    setBusy(true);
    try {
      const res = await linkAdSetAction(productId, id);
      if (!res.ok) throw new Error(res.error);
      setLinks((cur) => [...cur, res.campaign]);
      setAdSetDraft("");
      setOptions((cur) =>
        cur ? cur.map((o) => (o.id === res.campaign.metaAdSetId ? { ...o, linkedTo: "✓" } : o)) : cur,
      );
      toast.success(a.analytics.adSetLinked);
      if (res.syncWarning) toast.warning(res.syncWarning);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.adSetLinkFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onLinkCampaign() {
    const id = campaignDraft.trim();
    if (!id || busy) return;
    setBusy(true);
    try {
      const res = await linkAdCampaignAction(productId, id);
      if (!res.ok) throw new Error(res.error);
      setLinks((cur) => [...cur, res.campaign]);
      setCampaignDraft("");
      toast.success(a.analytics.campaignLinked);
      if (res.syncWarning) toast.warning(res.syncWarning);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.campaignLinkFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink(link: LinkedCampaign) {
    if (unlinkingId) return;
    setUnlinkingId(link.id);
    try {
      const res =
        link.kind === "adset"
          ? await unlinkAdSetAction(productId, link.id)
          : await unlinkAdCampaignAction(productId, link.id);
      if (!res.ok) throw new Error(res.error);
      setLinks((cur) => cur.filter((c) => c.id !== link.id));
      if (link.kind === "adset") {
        setOptions((cur) => (cur ? cur.map((o) => (o.id === link.metaAdSetId ? { ...o, linkedTo: null } : o)) : cur));
      }
      toast.success(link.kind === "adset" ? a.analytics.adSetUnlinked : a.analytics.campaignUnlinked);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : link.kind === "adset"
            ? a.analytics.adSetUnlinkFailed
            : a.analytics.campaignUnlinkFailed,
      );
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-[var(--admin-border)] bg-[var(--fill)] p-3">
      {/* Linked */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {a.analytics.campaignsTitle}
        </p>
        {links.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">{a.analytics.noCampaignsLinked}</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--admin-border)]">
            {[...adSets, ...campaigns].map((c) => (
              <li key={`${c.kind}-${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <AdminBadge hue={c.kind === "adset" ? "sky" : "slate"} size="sm" dot={false}>
                    {c.kind === "adset" ? a.analytics.linkKindAdSet : a.analytics.linkKindCampaign}
                  </AdminBadge>
                  <p className="mt-0.5 truncate text-sm text-[var(--foreground)]" dir="auto">
                    {c.label ?? (c.kind === "adset" ? c.metaAdSetId : c.metaCampaignId)}
                  </p>
                  <p className="truncate font-mono text-[11px] text-[var(--muted)]" dir="ltr">
                    {c.kind === "adset" ? `${c.metaAdSetId} · campaign ${c.metaCampaignId}` : c.metaCampaignId}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={unlinkingId === c.id}
                  onClick={() => void onUnlink(c)}
                  className="min-h-11 shrink-0 px-2 text-xs font-semibold text-[var(--danger)] disabled:opacity-60"
                >
                  {a.analytics.unlinkCampaign}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Link an ad set */}
      <div className="border-t border-[var(--admin-border)] pt-3">
        <p className="text-sm font-semibold text-[var(--foreground)]">{a.analytics.linkAdSetTitle}</p>
        <p className="mt-1 rounded-lg bg-[var(--hue-amber-bg)] px-2.5 py-2 text-xs leading-relaxed text-[var(--foreground)]">
          {a.analytics.adSetHint}
        </p>

        {options === null ? (
          <button
            type="button"
            disabled={loadingOptions}
            onClick={() => void loadOptions()}
            className="admin-btn-primary mt-2 min-h-11 w-full"
          >
            {loadingOptions ? a.analytics.adSetPickerLoading : a.analytics.adSetPickerLoad}
          </button>
        ) : (
          <div className="mt-2">
            {options.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">{a.analytics.adSetPickerEmpty}</p>
            ) : (
              <>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={a.analytics.adSetPickerSearch}
                  className="admin-input w-full"
                />
                <ul className="mt-2 max-h-80 divide-y divide-[var(--admin-border)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--admin-border)] bg-[var(--card)]">
                  {filteredOptions.map((o) => {
                    const blocked = Boolean(o.linkedTo || o.campaignLinkedWholeTo);
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          disabled={busy || blocked}
                          onClick={() => void onLinkAdSet(o.id)}
                          className="block min-h-11 w-full px-3 py-2 text-start disabled:opacity-55"
                        >
                          <span className="block truncate text-sm font-medium text-[var(--foreground)]" dir="auto">
                            {o.name}
                          </span>
                          <span className="block truncate text-xs text-[var(--muted)]" dir="auto">
                            {a.analytics.campaignLabel.replace("{name}", o.campaignName ?? o.campaignId)}
                          </span>
                          <span className="block font-mono text-[11px] text-[var(--muted)]" dir="ltr">
                            {o.id}
                          </span>
                          {o.linkedTo ? (
                            <span className="mt-0.5 block text-[11px] font-semibold text-[var(--success)]">
                              {a.analytics.adSetLinkedTo.replace("{product}", o.linkedTo)}
                            </span>
                          ) : o.campaignLinkedWholeTo ? (
                            <span className="mt-0.5 block text-[11px] font-semibold text-[var(--warning)]">
                              {a.analytics.adSetCampaignWholeTo.replace("{product}", o.campaignLinkedWholeTo)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {optionsTruncated ? (
                  <p className="mt-1 text-[11px] text-[var(--warning)]">{a.analytics.adSetPickerTruncated}</p>
                ) : null}
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowManualAdSet((v) => !v)}
          className="mt-2 min-h-11 text-xs font-semibold text-[var(--accent)]"
        >
          {a.analytics.adSetManualToggle}
        </button>
        {showManualAdSet ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              disabled={busy}
              value={adSetDraft}
              placeholder={a.analytics.adSetIdPlaceholder}
              onChange={(e) => setAdSetDraft(e.target.value.replace(/\s/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onLinkAdSet(adSetDraft);
                }
              }}
              className="admin-input w-full"
            />
            <button
              type="button"
              disabled={busy || !adSetDraft.trim()}
              onClick={() => void onLinkAdSet(adSetDraft)}
              className="admin-btn-primary min-h-11 w-full sm:w-auto"
            >
              {busy ? a.analytics.linking : a.analytics.linkCampaign}
            </button>
          </div>
        ) : null}
      </div>

      {/* Link a whole campaign */}
      <div className="border-t border-[var(--admin-border)] pt-3">
        <p className="text-sm font-semibold text-[var(--foreground)]">{a.analytics.linkWholeCampaignTitle}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{a.analytics.campaignHint}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            disabled={busy}
            value={campaignDraft}
            placeholder={a.analytics.campaignIdPlaceholder}
            onChange={(e) => setCampaignDraft(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onLinkCampaign();
              }
            }}
            className="admin-input w-full"
          />
          <button
            type="button"
            disabled={busy || !campaignDraft.trim()}
            onClick={() => void onLinkCampaign()}
            className="admin-btn-primary min-h-11 w-full sm:w-auto"
          >
            {busy ? a.analytics.linking : a.analytics.linkCampaign}
          </button>
        </div>
      </div>
    </div>
  );
}
