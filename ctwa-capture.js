const { createClient } = require("@supabase/supabase-js");

// --- Click-to-WhatsApp (CTWA) attribution capture. ---
// Reads inbound WhatsApp messages for one reason only: extracting the ad
// click id (ctwa_clid) that Meta attaches to a conversation started from a
// Click-to-WhatsApp ad, so a later manual sale can be linked back to it.
// Follows the same local makeSupabase() pattern as marketing-worker.js: a
// silent no-op when Supabase env vars aren't configured.

function makeSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Scans every key of a Baileys `msg.message` for a `contextInfo.externalAdReply`
 * block. Any message type can carry `contextInfo` (extendedTextMessage,
 * imageMessage, videoMessage, ...), and some values (e.g. `conversation`) are
 * plain strings rather than objects — those are skipped, not crashed on.
 *
 * @param {unknown} message - `msg.message` from a Baileys WAMessage.
 * @returns {Record<string, unknown> | null}
 */
function extractExternalAdReply(message) {
  if (!message || typeof message !== "object") return null;
  for (const key of Object.keys(message)) {
    const value = message[key];
    if (!value || typeof value !== "object") continue;
    const contextInfo = value.contextInfo;
    if (!contextInfo || typeof contextInfo !== "object") continue;
    const externalAdReply = contextInfo.externalAdReply;
    if (externalAdReply && typeof externalAdReply === "object") {
      return externalAdReply;
    }
  }
  return null;
}

/** Trimmed, non-empty `ctwaClid` from an externalAdReply block, or null. */
function extractCtwaClid(message) {
  const externalAdReply = extractExternalAdReply(message);
  const raw =
    externalAdReply && typeof externalAdReply.ctwaClid === "string"
      ? externalAdReply.ctwaClid.trim()
      : "";
  return raw || null;
}

/**
 * Resolves the phone-number JID for a message key, handling Baileys 7 LID
 * addressing: `key.remoteJid` can be `xxx@lid`, with the actual phone-number
 * JID in `key.remoteJidAlt`. Only a value ending in `@s.whatsapp.net` is
 * accepted, so groups (`@g.us`) and `status@broadcast` are excluded.
 *
 * @param {{ remoteJid?: string, remoteJidAlt?: string } | null | undefined} key
 * @returns {string | null}
 */
function phoneJidFromKey(key) {
  if (!key || typeof key !== "object") return null;
  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (remoteJid.endsWith("@s.whatsapp.net")) return remoteJid;
  const remoteJidAlt = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  if (remoteJidAlt.endsWith("@s.whatsapp.net")) return remoteJidAlt;
  return null;
}

/**
 * Verbatim copy of `sanitizePhoneForMetaE164` from `src/lib/meta-user-data.ts`.
 * This CommonJS file never goes through the TypeScript module graph, so the
 * duplication is deliberate — but if either implementation changes, the other
 * must change too, or phone lookups between `whatsapp_ad_clicks` and
 * `orders`/Meta CAPI will stop matching.
 *
 * @param {string} raw
 * @returns {string | null}
 */
function toMetaE164Digits(raw) {
  let s = String(raw == null ? "" : raw)
    .trim()
    .replace(/[\s\-().]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);

  const digits = s.replace(/\D/g, "");
  if (!digits) return null;

  // Mauritania: ensure 222 country code; local 8-digit numbers become 222XXXXXXXX.
  let normalized = digits;
  if (normalized.length === 8 && /^[234]/.test(normalized)) {
    normalized = `222${normalized}`;
  }

  // E.164: 8–15 digits, no leading zero on full number.
  if (normalized.startsWith("0")) normalized = normalized.replace(/^0+/, "");
  if (!/^\d{8,15}$/.test(normalized)) return null;

  return normalized;
}

/**
 * Builds `whatsapp_ad_clicks` rows from one `messages.upsert` event.
 * @param {any} upsert - Baileys `messages.upsert` payload.
 * @returns {Array<{ phone: string, ctwa_clid: string, ad_source_id: string | null, source_url: string | null, source_type: string | null }>}
 */
function buildRowsFromUpsert(upsert) {
  const rows = [];
  const messages = Array.isArray(upsert && upsert.messages) ? upsert.messages : [];

  for (const msg of messages) {
    try {
      const ctwaClid = extractCtwaClid(msg && msg.message);
      if (!ctwaClid) continue;

      const jid = phoneJidFromKey(msg && msg.key);
      if (!jid) continue;

      const phone = toMetaE164Digits(jid.split("@")[0]);
      if (!phone) continue;

      const externalAdReply = extractExternalAdReply(msg.message) || {};
      rows.push({
        phone,
        ctwa_clid: ctwaClid,
        ad_source_id:
          typeof externalAdReply.sourceId === "string" ? externalAdReply.sourceId : null,
        source_url:
          typeof externalAdReply.sourceUrl === "string" ? externalAdReply.sourceUrl : null,
        source_type:
          typeof externalAdReply.sourceType === "string" ? externalAdReply.sourceType : null,
      });
    } catch {
      // One malformed message must never drop the rest of the batch.
    }
  }

  return rows;
}

/**
 * Captures CTWA ad-click ids from an inbound `messages.upsert` event and
 * upserts them into `whatsapp_ad_clicks`. Read-only with respect to WhatsApp
 * itself — never replies, never marks messages read. Swallows all of its own
 * errors so a capture failure can never disturb the WhatsApp connection.
 *
 * @param {any} upsert - Baileys `messages.upsert` payload.
 * @param {(message: string) => void} [logEvent]
 */
async function recordCtwaClicksFromUpsert(upsert, logEvent) {
  try {
    // Type "append" is history sync on reconnect — processing it would
    // re-insert old clicks with a wrong `clicked_at`. Only live inbound
    // messages ("notify") are attribution-relevant.
    if (!upsert || upsert.type !== "notify") return;

    const supabase = makeSupabase();
    if (!supabase) return;

    const rows = buildRowsFromUpsert(upsert);
    if (rows.length === 0) return;

    const { error } = await supabase
      .from("whatsapp_ad_clicks")
      .upsert(rows, { onConflict: "ctwa_clid", ignoreDuplicates: true });

    if (error) {
      if (typeof logEvent === "function") {
        logEvent(`CTWA: capture failed: ${error.message}`);
      }
      return;
    }

    if (typeof logEvent === "function") {
      logEvent(`CTWA: recorded ${rows.length} ad click id(s)`);
    }
  } catch (e) {
    try {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof logEvent === "function") logEvent(`CTWA: capture error: ${msg}`);
    } catch {
      // ignore
    }
  }
}

module.exports = {
  recordCtwaClicksFromUpsert,
  extractExternalAdReply,
  extractCtwaClid,
  phoneJidFromKey,
  toMetaE164Digits,
};
