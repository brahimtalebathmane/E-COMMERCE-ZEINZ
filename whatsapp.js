const pino = require("pino");
const qrcode = require("qrcode");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

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

function authDir() {
  return process.env.WHATSAPP_AUTH_DIR || "./baileys_auth";
}

function pushLog(message) {
  const line = `${new Date().toISOString()} — ${message}`;
  logs = [...logs, line].slice(-10);
}

function logOtpGenerated(phoneE164, expiresAtIso) {
  const safePhone = normalizeE164(phoneE164) || String(phoneE164 || "");
  pushLog(`OTP generated for ${safePhone} (expires ${expiresAtIso})`);
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

async function connectWhatsApp() {
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir());
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: "silent" }),
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          connectionStatus = "qr";
          latestQr = qr;
          pushLog("QR generated");
        }

        if (connection === "open") {
          connectionStatus = "connected";
          latestQr = null;
          pushLog("WhatsApp connected");
        }

        if (connection === "close") {
          connectionStatus = "disconnected";
          latestQr = null;
          pushLog("WhatsApp disconnected");

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

          sock = null;
          connectPromise = null;

          if (!loggedOut) {
            setTimeout(() => {
              void reconnectWhatsApp();
            }, 1200);
          }
        }
      });
    } catch (e) {
      connectionStatus = "disconnected";
      latestQr = null;
      pushLog(`WhatsApp error: ${e instanceof Error ? e.message : String(e)}`);
      sock = null;
      connectPromise = null;
    }
  })();
  return connectPromise;
}

async function reconnectWhatsApp() {
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
    pushLog("Reconnect requested");
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
  pushLog(`Message sent to ${normalizeE164(phone)}`);
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
      pushLog("waitForConnected: QR required — session not active");
      return false;
    }
    await sleep(300);
  }

  const ok = Boolean(sock && connectionStatus === "connected");
  if (!ok) {
    pushLog(`waitForConnected: timeout after ${timeoutMs}ms (status=${connectionStatus})`);
  }
  return ok;
}

// Start on first require (server boot).
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
};

