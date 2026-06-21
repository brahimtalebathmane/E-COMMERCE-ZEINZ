const fs = require("fs");
const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const MAX_LOG_LINES = 200;

/** @type {"connected" | "disconnected" | "qr"} */
let connectionStatus = "disconnected";
/** @type {string | null} */
let latestQr = null;
/** @type {string[]} */
let logs = [];

/** @type {import("@whiskeysockets/baileys").WASocket | null} */
let sock = null;
/** @type {Promise<void> | null} */
let connectPromise = null;

/** True if the current connection cycle showed a QR (new pairing). */
let sawQrThisCycle = false;
/** Incrementing counter for automatic reconnects after disconnect (reset on open or manual reconnect). */
let autoReconnectAttempt = 0;
/** Last disconnect reason string for /api/status. */
let lastDisconnectReason = "";

function authDir() {
  const raw = process.env.WHATSAPP_AUTH_DIR || "./baileys_auth";
  return path.resolve(raw);
}

function ensureAuthDir() {
  const dir = authDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Baileys `useMultiFileAuthState` persists `creds.json` plus key files under this directory.
 */
function hasSavedSessionOnDisk() {
  try {
    const dir = authDir();
    const creds = path.join(dir, "creds.json");
    return fs.existsSync(creds);
  } catch {
    return false;
  }
}

function pushLog(message) {
  const line = `${new Date().toISOString()} — ${message}`;
  logs = [...logs, line].slice(-MAX_LOG_LINES);
}

function logEvent(message) {
  pushLog(message);
  // eslint-disable-next-line no-console
  console.log(`[WhatsApp] ${message}`);
}

function logOtpGenerated(phoneE164, expiresAtIso) {
  const safePhone = normalizeE164(phoneE164) || String(phoneE164 || "");
  logEvent(`OTP generated for ${safePhone} (expires ${expiresAtIso})`);
}

function normalizeE164(phone) {
  const trimmed = String(phone || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function jidFromPhone(phone) {
  const e164 = normalizeE164(phone);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function getNextReconnectDelayMs() {
  const base = 1200;
  const cap = 60_000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, autoReconnectAttempt - 1)));
  return exp;
}

function describeDisconnect(lastDisconnect) {
  const statusCode =
    lastDisconnect?.error?.output?.statusCode ??
    lastDisconnect?.error?.statusCode ??
    null;
  const msg = lastDisconnect?.error?.message || lastDisconnect?.error?.toString?.() || "";
  if (typeof statusCode === "number") {
    return `statusCode=${statusCode}${msg ? ` (${msg})` : ""}`;
  }
  return msg || "unknown";
}

async function connectWhatsApp() {
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    try {
      const dir = ensureAuthDir();
      const hadSession = hasSavedSessionOnDisk();
      sawQrThisCycle = false;

      logEvent(
        hadSession
          ? `Startup: found saved session on disk — restoring (${dir})`
          : `Startup: no session file yet — QR will be required (${dir})`,
      );

      const { state, saveCreds } = await useMultiFileAuthState(dir);
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: "silent" }),
      });

      sock.ev.on("creds.update", async () => {
        try {
          await saveCreds();
          logEvent("Session credentials updated — persisted to disk");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logEvent(`Failed to persist session credentials: ${msg}`);
        }
      });

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          connectionStatus = "qr";
          latestQr = qr;
          sawQrThisCycle = true;
          logEvent("QR generated — scan with WhatsApp to pair");
        }

        if (connection === "open") {
          connectionStatus = "connected";
          latestQr = null;
          autoReconnectAttempt = 0;
          lastDisconnectReason = "";

          if (sawQrThisCycle) {
            logEvent("Connected — paired after QR scan");
          } else if (hadSession) {
            logEvent("Session restored — connected");
          } else {
            logEvent("Connected");
          }
        }

        if (connection === "close") {
          connectionStatus = "disconnected";
          latestQr = null;

          const statusCode =
            lastDisconnect?.error?.output?.statusCode ??
            lastDisconnect?.error?.statusCode ??
            null;
          const reason =
            typeof statusCode === "number"
              ? statusCode
              : DisconnectReason.connectionClosed;

          const loggedOut =
            reason === DisconnectReason.loggedOut ||
            reason === DisconnectReason.badSession;

          lastDisconnectReason = describeDisconnect(lastDisconnect);
          logEvent(`Disconnected (${lastDisconnectReason})${loggedOut ? " — session invalid; scan QR again" : ""}`);

          sock = null;
          connectPromise = null;

          if (!loggedOut) {
            autoReconnectAttempt += 1;
            const delayMs = getNextReconnectDelayMs();
            logEvent(
              `Reconnection attempt ${autoReconnectAttempt} scheduled in ${delayMs}ms`,
            );
            setTimeout(() => {
              void reconnectWhatsApp({ manual: false });
            }, delayMs);
          } else {
            autoReconnectAttempt = 0;
          }
        }
      });
    } catch (e) {
      connectionStatus = "disconnected";
      latestQr = null;
      const msg = e instanceof Error ? e.message : String(e);
      logEvent(`WhatsApp error: ${msg}`);
      sock = null;
      connectPromise = null;
    }
  })();
  return connectPromise;
}

/**
 * @param {{ manual?: boolean }} [options]
 * - manual: user clicked Reconnect — reset auto-retry counter.
 */
async function reconnectWhatsApp(options = {}) {
  const manual = options.manual === true;
  try {
    if (sock) {
      try {
        sock.end(new Error("reconnect"));
      } catch {
        // ignore
      }
    }
  } finally {
    sock = null;
    connectPromise = null;
    connectionStatus = "disconnected";
    latestQr = null;
    if (manual) {
      autoReconnectAttempt = 0;
      logEvent("Manual reconnect requested");
    }
    await connectWhatsApp();
  }
}

function getQR() {
  return latestQr;
}

function getStatus() {
  return connectionStatus;
}

function getLogs() {
  return logs;
}

function getConnectionInfo() {
  const dir = authDir();
  return {
    authDir: dir,
    hasSavedSession: hasSavedSessionOnDisk(),
    autoReconnectAttempt,
    lastDisconnectReason: lastDisconnectReason || null,
  };
}

async function getQrDataUrl() {
  if (!latestQr) return null;
  return await qrcode.toDataURL(latestQr, {
    margin: 1,
    scale: 8,
    errorCorrectionLevel: "M",
  });
}

async function sendWhatsAppMessage(phone, message) {
  await connectWhatsApp();
  if (!sock || connectionStatus !== "connected") {
    throw new Error("WhatsApp not connected");
  }
  const jid = jidFromPhone(phone);
  if (!jid) throw new Error("Invalid phone number");
  const text = String(message || "").trim();
  if (!text) throw new Error("Empty message");

  await sock.sendMessage(jid, { text });
  logEvent(`Message sent to ${normalizeE164(phone)}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function assertConnected() {
  await connectWhatsApp();
  return Boolean(sock && connectionStatus === "connected");
}

/**
 * Waits until Baileys reports "connected" or timeout. Use before send so cold starts
 * don't immediately return 503 while the socket is still opening.
 */
async function waitForConnected(timeoutMs = 45000) {
  const started = Date.now();
  await connectWhatsApp();

  while (Date.now() - started < timeoutMs) {
    if (sock && connectionStatus === "connected") {
      return true;
    }
    if (connectionStatus === "qr") {
      logEvent("waitForConnected: QR required — session not active");
      return false;
    }
    await sleep(300);
  }

  const ok = Boolean(sock && connectionStatus === "connected");
  if (!ok) {
    logEvent(`waitForConnected: timeout after ${timeoutMs}ms (status=${connectionStatus})`);
  }
  return ok;
}

// Start on first require (server boot) — restores session from disk when available.
void connectWhatsApp();

module.exports = {
  getQR,
  getStatus,
  getLogs,
  getQrDataUrl,
  reconnectWhatsApp,
  sendWhatsAppMessage,
  assertConnected,
  waitForConnected,
  logOtpGenerated,
  getConnectionInfo,
};
