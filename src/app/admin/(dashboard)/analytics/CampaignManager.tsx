"use client";

import { useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { linkAdCampaignAction, unlinkAdCampaignAction } from "./actions";
import type { LinkedCampaign } from "./data";

/**
 * Link / unlink Meta ad campaigns to one product so its ad spend is pulled
 * live from the Marketing API. Shared by the owned (MRU) dashboard and the
 * affiliate (COD Partner) section; the actions reject products outside the
 * selected country.
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
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [draft, setDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  async function onLink() {
    const id = draft.trim();
    if (!id || linking) return;
    setLinking(true);
    try {
      const res = await linkAdCampaignAction(productId, id);
      if (!res.ok) throw new Error(res.error);
      setCampaigns((cur) => [...cur, { id: res.campaign.id, metaCampaignId: res.campaign.metaCampaignId, label: res.campaign.label }]);
      setDraft("");
      toast.success(a.analytics.campaignLinked);
      if (res.syncWarning) toast.warning(res.syncWarning);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.campaignLinkFailed);
    } finally {
      setLinking(false);
    }
  }

  async function onUnlink(campaignRowId: string) {
    if (unlinkingId) return;
    setUnlinkingId(campaignRowId);
    try {
      const res = await unlinkAdCampaignAction(productId, campaignRowId);
      if (!res.ok) throw new Error(res.error);
      setCampaigns((cur) => cur.filter((c) => c.id !== campaignRowId));
      toast.success(a.analytics.campaignUnlinked);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.campaignUnlinkFailed);
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--admin-border)] bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {a.analytics.campaignsTitle}
      </p>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">{a.analytics.noCampaignsLinked}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono" dir="ltr">
                {c.label ? `${c.label} (${c.metaCampaignId})` : c.metaCampaignId}
              </span>
              <button
                type="button"
                disabled={unlinkingId === c.id}
                onClick={() => void onUnlink(c.id)}
                className="shrink-0 text-[11px] font-semibold text-red-300 underline-offset-2 hover:underline disabled:opacity-60"
              >
                {a.analytics.unlinkCampaign}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          dir="ltr"
          disabled={linking}
          value={draft}
          placeholder={a.analytics.campaignIdPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onLink();
            }
          }}
          className="admin-input w-full !text-xs"
        />
        <button
          type="button"
          disabled={linking || !draft.trim()}
          onClick={() => void onLink()}
          className="admin-btn-primary w-full !px-3 !text-xs sm:w-auto"
        >
          {linking ? a.analytics.linking : a.analytics.linkCampaign}
        </button>
      </div>
    </div>
  );
}
