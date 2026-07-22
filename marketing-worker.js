const { createClient } = require("@supabase/supabase-js");

// --- Hardcoded limits. Per explicit requirement: never configurable from the
// admin UI, the database, or any env var — only a code change can adjust
// these. This WhatsApp number also handles order confirmations, so sending
// too fast or too much is what risks the whole business's confirmation
// channel, not just this feature. ---
const MIN_DELAY_MS = 20_000;
const MAX_DELAY_MS = 45_000;
const DAILY_CAP = 80;
const CONSECUTIVE_FAILURE_LIMIT = 3;

const IDLE_POLL_MS = 60_000;
const ACTIVE_POLL_MS = 15_000;

function randomDelayMs() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Africa/Nouakchott (this store's operational timezone, used elsewhere in
 * the admin panel for "today" bucketing) is UTC+0 with no DST — so "today in
 * Nouakchott" is identical to "today in UTC". A plain UTC-midnight boundary
 * is therefore exact, not an approximation; do not swap this for a timezone
 * library conversion.
 */
function todayUtcBounds() {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: startOfDay.toISOString(), endIso: endOfDay.toISOString() };
}

function makeSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Global count of messages sent today, across ALL campaigns combined — the daily cap is a shared budget. */
async function countSentToday(supabase) {
  const { startIso, endIso } = todayUtcBounds();
  const { count, error } = await supabase
    .from("marketing_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startIso)
    .lt("sent_at", endIso);
  if (error) throw new Error(`countSentToday: ${error.message}`);
  return count || 0;
}

/** Oldest `sending` campaign that still has at least one `pending` recipient. */
async function claimNextCampaign(supabase) {
  const { data: campaigns, error } = await supabase
    .from("marketing_campaigns")
    .select("id")
    .eq("status", "sending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`claimNextCampaign: ${error.message}`);
  if (!campaigns || campaigns.length === 0) return null;

  for (const campaign of campaigns) {
    const { data: pending, error: pErr } = await supabase
      .from("marketing_campaign_recipients")
      .select("id, phone, customer_name")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) throw new Error(`claimNextCampaign pending lookup: ${pErr.message}`);
    if (pending) return { campaignId: campaign.id, recipient: pending };
  }
  return null; // every `sending` campaign has drained its pending rows
}

async function loadCampaignMessage(supabase, campaignId) {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("message_text, image_url")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) throw new Error(`loadCampaignMessage: ${error ? error.message : "not found"}`);
  return { text: data.message_text, imageUrl: data.image_url || undefined };
}

async function markRecipientSent(supabase, recipientId) {
  await supabase
    .from("marketing_campaign_recipients")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", recipientId);
}

async function markRecipientFailed(supabase, recipientId, errorMsg) {
  await supabase
    .from("marketing_campaign_recipients")
    .update({ status: "failed", error_message: errorMsg })
    .eq("id", recipientId);
}

async function pauseCampaign(supabase, campaignId) {
  await supabase.from("marketing_campaigns").update({ status: "failed" }).eq("id", campaignId);
}

/** Flips a campaign to `completed` once it has no `pending` recipients left — unless it was concurrently auto-paused. */
async function markCampaignCompletedIfDrained(supabase, campaignId) {
  const { count } = await supabase
    .from("marketing_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  if (count === 0) {
    await supabase
      .from("marketing_campaigns")
      .update({ status: "completed" })
      .eq("id", campaignId)
      .eq("status", "sending"); // don't clobber a concurrent auto-pause to `failed`
  }
}

/**
 * Starts the marketing campaign background worker inside this same always-on
 * process. Stateless polling loop — every decision (which campaign, which
 * recipient, today's sent count, failure streak) is re-derived from Supabase
 * on each tick, so a process restart mid-campaign is safe: it just resumes
 * from whatever the DB says, no in-memory cursor to lose.
 *
 * Does nothing (logs once) if Supabase env vars aren't configured, so a
 * deployment that only needs order confirmations is unaffected.
 *
 * @param {{ sendWhatsAppMessage: (phone: string, text: string, opts?: { imageUrl?: string }) => Promise<void> }} deps
 */
function startMarketingWorker(deps) {
  const supabase = makeSupabase();
  if (!supabase) {
    // eslint-disable-next-line no-console
    console.log("[MarketingWorker] Supabase env vars not set — marketing worker disabled");
    return () => {};
  }

  let stopped = false;

  async function tick() {
    if (stopped) return;
    let nextDelay = IDLE_POLL_MS;
    try {
      const claim = await claimNextCampaign(supabase);
      if (!claim) {
        nextDelay = IDLE_POLL_MS;
      } else {
        nextDelay = ACTIVE_POLL_MS;
        const sentToday = await countSentToday(supabase);
        if (sentToday >= DAILY_CAP) {
          // Quota reached — not a failure. Campaign stays `sending`; the loop
          // just idles and resumes automatically once the calendar day rolls over.
          // eslint-disable-next-line no-console
          console.log(`[MarketingWorker] Daily cap reached (${sentToday}/${DAILY_CAP}) — pausing until tomorrow`);
          nextDelay = IDLE_POLL_MS;
        } else {
          const { campaignId, recipient } = claim;
          const { text, imageUrl } = await loadCampaignMessage(supabase, campaignId);

          try {
            await deps.sendWhatsAppMessage(recipient.phone, text, { imageUrl });
            await markRecipientSent(supabase, recipient.id);
            // eslint-disable-next-line no-console
            console.log(`[MarketingWorker] Sent to ${recipient.phone} (campaign ${campaignId})`);
          } catch (sendErr) {
            const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            await markRecipientFailed(supabase, recipient.id, msg);
            // eslint-disable-next-line no-console
            console.error(`[MarketingWorker] Send failed to ${recipient.phone}: ${msg}`);

            const { data: updated } = await supabase
              .from("marketing_campaigns")
              .select("consecutive_failures")
              .eq("id", campaignId)
              .maybeSingle();
            if (updated && updated.consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT) {
              await pauseCampaign(supabase, campaignId);
              // eslint-disable-next-line no-console
              console.error(
                `[MarketingWorker] Campaign ${campaignId} auto-paused after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures — awaiting manual resume`,
              );
            }
          }

          await markCampaignCompletedIfDrained(supabase, campaignId);
          await sleep(randomDelayMs()); // pacing delay applies after every attempt, success or failure
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(`[MarketingWorker] tick error: ${msg}`);
    }
    if (!stopped) setTimeout(tick, nextDelay);
  }

  // eslint-disable-next-line no-console
  console.log("[MarketingWorker] Started");
  void tick();

  return () => {
    stopped = true;
  };
}

module.exports = { startMarketingWorker, DAILY_CAP, CONSECUTIVE_FAILURE_LIMIT, MIN_DELAY_MS, MAX_DELAY_MS };
