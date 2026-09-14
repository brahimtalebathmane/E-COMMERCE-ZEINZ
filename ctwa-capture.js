const { createClient } = require("@supabase/supabase-js");

/**
 * Inbound WhatsApp capture.
 *
 * Two jobs, from the same message stream:
 *
 *  1. Every inbound 1:1 message updates `whatsapp_contacts` — the list the admin
 *     picks a conversation from when recording a WhatsApp sale.
 *  2. When someone clicks a "click to WhatsApp" ad, Meta attaches a `ctwaClid`
 *     to the first message they send. That id is the only deterministic link
 *     between the ad click and the sale, so it is also written to
 *     `whatsapp_ad_clicks` and later replayed on the Meta Purchase event
 *     (see src/lib/meta/dispatch.ts).
 *
 * Same shape as marketing-worker.js: plain CommonJS and its own service-role
 * Supabase client. When the env vars aren't configured it disables itself rather
 * than crashing — but it says so in the log exactly once, because a silent
 * no-op here is indistinguishable from "no messages arrived".
 */

function makeSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let cachedSupabase;
let warnedNoSupabase = false;

/**
 * Returns null when the env vars aren't configured. Warns ONCE rather than
 * failing silently: a missing SUPABASE_SERVICE_ROLE_KEY on the WhatsApp host
 * looks exactly like "no messages arrived", which is impossible to diagnose
 * from the outside.
 */
function getSupabase(log) {
  if (cachedSupabase === undefined) cachedSupabase = makeSupabase();
  if (!cachedSupabase && !warnedNoSupabase) {
    warnedNoSupabase = true;
    const msg =
      "WhatsApp capture DISABLED — NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are not set on this host";
    if (typeof log === "function") log(msg);
    // eslint-disable-next-line no-console
    console.error(`[WhatsApp] ${msg}`);
  }
  return cachedSupabase;
}

/**
 * Mirror of sanitizePhoneForMetaE164 in src/lib/meta-user-data.ts.
 * Kept as a copy on purpose: this file is CommonJS loaded by the Baileys
 * process, which never goes through the Next.js/TS module graph. If the TS
 * version changes, change this one too — they must agree or the lookup in
 * resolveManualSaleMetaSignals() will never match.
 */
function toMetaE164Digits(raw) {
  let s = String(raw || "").trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);

  const digits = s.replace(/\D/g, "");
  if (!digits) return null;

  let normalized = digits;
  if (normalized.length === 8 && /^[234]/.test(normalized)) {
    normalized = `222${normalized}`;
  }
  if (normalized.startsWith("0")) normalized = normalized.replace(/^0+/, "");
  if (!/^\d{8,15}$/.test(normalized)) return null;
  return normalized;
}

/**
 * The phone-number JID for an inbound message.
 *
 * Baileys 7 may address a chat by LID (`<id>@lid`) rather than by phone number,
 * in which case `key.remoteJidAlt` carries the `@s.whatsapp.net` form. Groups,
 * newsletters, status broadcasts and anything else are ignored — a CTWA click
 * is always a 1:1 chat.
 */
function phoneJidFromKey(key) {
  const candidates = [key && key.remoteJid, key && key.remoteJidAlt];
  for (const jid of candidates) {
    if (typeof jid === "string" && jid.endsWith("@s.whatsapp.net")) return jid;
  }
  return null;
}

/**
 * Any message type can carry contextInfo (text, image, video, …), so scan the
 * message envelope rather than hard-coding extendedTextMessage. Returns the
 * externalAdReply block only when it carries a non-empty ctwaClid — a valid
 * ad-reply block with no click id (or an all-whitespace one) is not useful
 * attribution data.
 */
function extractExternalAdReply(message) {
  if (!message || typeof message !== "object") return null;
  for (const key of Object.keys(message)) {
    const value = message[key];
    const ad = value && typeof value === "object" ? value.contextInfo?.externalAdReply : null;
    if (ad && typeof ad.ctwaClid === "string" && ad.ctwaClid.trim()) return ad;
  }
  return null;
}

/** WhatsApp profile name of the sender, when the message carries one. */
function senderDisplayName(msg) {
  const name = msg && msg.pushName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * Records one `messages.upsert` batch.
 *
 * Two outputs, deliberately separate:
 *  - EVERY inbound 1:1 message updates `whatsapp_contacts`, which is what the
 *    admin picks from when recording a WhatsApp sale. An organic chat with no
 *    ad behind it still has to appear in that list.
 *  - Messages that carry a Click-to-WhatsApp referral ALSO insert into
 *    `whatsapp_ad_clicks`, the per-click ledger the ad-performance report reads.
 *
 * Never throws — a capture failure must not disturb the WhatsApp connection.
 *
 * @param {{ messages: any[], type: string }} upsert
 * @param {(message: string) => void} [log]
 */
async function recordInboundWhatsAppMessages(upsert, log) {
  // "append" is history sync on (re)connect — replaying it would re-insert old
  // clicks with a wrong clicked_at and inflate inbound_count. Only live messages.
  if (!upsert || !Array.isArray(upsert.messages)) return;
  if (upsert.type !== "notify") {
    if (typeof log === "function") {
      log(`WhatsApp inbound: ignored ${upsert.messages.length} message(s) of type "${upsert.type}" (history sync)`);
    }
    return;
  }

  const supabase = getSupabase(log);
  if (!supabase) return;

  /** @type {Map<string, {phone:string, displayName:string|null, at:Date, ad:any}>} */
  const contacts = new Map();
  const clickRows = [];

  for (const msg of upsert.messages) {
    if (!msg || !msg.key || msg.key.fromMe) continue;
    const jid = phoneJidFromKey(msg.key);
    if (!jid) continue;

    const phone = toMetaE164Digits(jid.split("@")[0]);
    if (!phone) continue;

    const timestampSec = Number(msg.messageTimestamp);
    const at = Number.isFinite(timestampSec) && timestampSec > 0
      ? new Date(timestampSec * 1000)
      : new Date();

    const ad = extractExternalAdReply(msg.message);

    // Collapse a burst from one sender into a single contact write; keep the
    // newest timestamp and the first ad referral seen.
    const existing = contacts.get(phone);
    if (!existing || at > existing.at) {
      contacts.set(phone, {
        phone,
        displayName: senderDisplayName(msg) || (existing && existing.displayName) || null,
        at,
        ad: (existing && existing.ad) || ad || null,
      });
    } else if (ad && !existing.ad) {
      existing.ad = ad;
    }

    if (ad) {
      clickRows.push({
        phone,
        ctwa_clid: ad.ctwaClid.trim(),
        ad_source_id: (ad.sourceId && String(ad.sourceId).trim()) || null,
        source_url: (ad.sourceUrl && String(ad.sourceUrl).trim()) || null,
        source_type: (ad.sourceType && String(ad.sourceType).trim()) || null,
        clicked_at: at.toISOString(),
      });
    }
  }

  if (contacts.size === 0) {
    // Reached only for messages we sent, group/broadcast chats, or a JID whose
    // number could not be normalized — worth a line, or "nothing happened" and
    // "the listener never ran" look identical in the log.
    if (typeof log === "function") {
      log(`WhatsApp inbound: ${upsert.messages.length} message(s) seen, none recordable (own/group/unparseable)`);
    }
    return;
  }

  try {
    // Contacts first: the sale picker must list the conversation even if the
    // click ledger write below fails.
    for (const c of contacts.values()) {
      const { error } = await supabase.rpc("record_whatsapp_inbound", {
        p_phone: c.phone,
        p_display_name: c.displayName,
        p_inbound_at: c.at.toISOString(),
        p_ctwa_clid: c.ad ? c.ad.ctwaClid.trim() : null,
        p_ad_source_id: c.ad && c.ad.sourceId ? String(c.ad.sourceId).trim() : null,
      });
      if (error) throw new Error(`contacts: ${error.message}`);
    }

    if (clickRows.length > 0) {
      // ignoreDuplicates: the same ctwa_clid rides along on every later message
      // in the ad conversation; the first insert holds the real click time.
      const { error } = await supabase
        .from("whatsapp_ad_clicks")
        .upsert(clickRows, { onConflict: "ctwa_clid", ignoreDuplicates: true });
      if (error) throw new Error(`clicks: ${error.message}`);
    }

    if (typeof log === "function") {
      log(
        `WhatsApp inbound: ${contacts.size} contact(s)` +
          (clickRows.length ? `, ${clickRows.length} ad click id(s)` : ""),
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof log === "function") log(`WhatsApp inbound capture failed: ${msg}`);
    // eslint-disable-next-line no-console
    console.error("[WhatsApp] inbound capture failed", msg);
  }
}

module.exports = {
  recordInboundWhatsAppMessages,
  extractExternalAdReply,
  phoneJidFromKey,
  senderDisplayName,
  toMetaE164Digits,
};
