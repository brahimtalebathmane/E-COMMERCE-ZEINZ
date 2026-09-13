const { createClient } = require("@supabase/supabase-js");

/**
 * Click-to-WhatsApp (CTWA) click-id capture.
 *
 * When someone clicks a "click to WhatsApp" ad, Meta attaches a `ctwaClid` to
 * the first message they send us. That id is the only deterministic link
 * between the ad click and the sale the admin later records by hand, so we
 * persist it against the sender's phone number and replay it on the Meta
 * Purchase event (see src/lib/meta/dispatch.ts).
 *
 * Same shape as marketing-worker.js: plain CommonJS, its own service-role
 * Supabase client, and a hard no-op when the env vars aren't configured so a
 * deployment that only sends order confirmations is unaffected.
 */

function makeSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let cachedSupabase;
function getSupabase() {
  if (cachedSupabase === undefined) cachedSupabase = makeSupabase();
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

/**
 * Records the CTWA click ids carried by a `messages.upsert` batch.
 * Never throws — a capture failure must not disturb the WhatsApp connection.
 *
 * @param {{ messages: any[], type: string }} upsert
 * @param {(message: string) => void} [log]
 */
async function recordCtwaClicksFromUpsert(upsert, log) {
  // "append" is history sync on (re)connect — replaying it would re-insert old
  // clicks with a wrong clicked_at. Only live messages count.
  if (!upsert || upsert.type !== "notify" || !Array.isArray(upsert.messages)) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const rows = [];
  for (const msg of upsert.messages) {
    // Our own outbound messages (order confirmations, marketing) never carry
    // an ad-click context and must never be attributed as if a customer sent them.
    if (!msg || !msg.key || msg.key.fromMe) continue;
    const jid = phoneJidFromKey(msg.key);
    if (!jid) continue;

    const ad = extractExternalAdReply(msg.message);
    if (!ad) continue;

    const phone = toMetaE164Digits(jid.split("@")[0]);
    if (!phone) continue;

    const timestampSec = Number(msg.messageTimestamp);
    const clickedAt =
      Number.isFinite(timestampSec) && timestampSec > 0
        ? new Date(timestampSec * 1000)
        : new Date();

    rows.push({
      phone,
      ctwa_clid: ad.ctwaClid.trim(),
      ad_source_id: (ad.sourceId && String(ad.sourceId).trim()) || null,
      source_url: (ad.sourceUrl && String(ad.sourceUrl).trim()) || null,
      source_type: (ad.sourceType && String(ad.sourceType).trim()) || null,
      clicked_at: clickedAt.toISOString(),
    });
  }

  if (rows.length === 0) return;

  try {
    // ignoreDuplicates: the same ctwa_clid rides along on every later message in
    // the ad conversation; the first insert is the one with the real click time.
    const { error } = await supabase
      .from("whatsapp_ad_clicks")
      .upsert(rows, { onConflict: "ctwa_clid", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    if (typeof log === "function") {
      log(`CTWA: recorded ${rows.length} ad click id(s)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof log === "function") log(`CTWA capture failed: ${msg}`);
    // eslint-disable-next-line no-console
    console.error("[CTWA] capture failed", msg);
  }
}

module.exports = {
  recordCtwaClicksFromUpsert,
  extractExternalAdReply,
  phoneJidFromKey,
  toMetaE164Digits,
};
