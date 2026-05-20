const pino = require("pino");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { normalizeE164 } = require("./otp-service");

function resolveWebhookUrl() {
  // Split deploy (Netlify storefront + Railway Baileys): forward to Netlify API.
  const forward = process.env.WHATSAPP_WEBHOOK_FORWARD_URL?.trim();
  if (forward) return forward.replace(/\/$/, "");

  const explicit = process.env.WEBHOOK_INTERNAL_BASE_URL?.trim();
  const port = process.env.PORT || "3000";
  const base = explicit || `http://127.0.0.1:${port}`;
  return `${base.replace(/\/$/, "")}/api/webhooks/whatsapp`;
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.buttonsResponseMessage?.selectedDisplayText) {
    return m.buttonsResponseMessage.selectedDisplayText;
  }
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return "";
}

function hasImage(msg) {
  return Boolean(msg.message?.imageMessage);
}

async function imageToDataUrl(sock, msg) {
  const buffer = await downloadMediaMessage(
    msg,
    "buffer",
    {},
    {
      logger: pino({ level: "silent" }),
      reuploadRequest: sock.updateMediaMessage,
    },
  );
  const mime = msg.message?.imageMessage?.mimetype || "image/jpeg";
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function forwardInbound(sock, msg) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp-inbound] WHATSAPP_WEBHOOK_SECRET not set — inbound AI disabled",
    );
    return;
  }

  const remoteJid = msg.key?.remoteJid || "";
  if (!remoteJid.endsWith("@s.whatsapp.net")) return;

  const digits = remoteJid.replace(/@s.whatsapp.net$/, "");
  const phone = normalizeE164(digits.startsWith("+") ? digits : `+${digits}`);
  if (!phone) return;

  const text = extractText(msg).trim();
  let image_data_url = null;
  if (hasImage(msg)) {
    try {
      image_data_url = await imageToDataUrl(sock, msg);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[whatsapp-inbound] image download failed", errMsg);
    }
  }

  if (!text && !image_data_url) return;

  const payload = {
    phone,
    text: text || null,
    image_data_url,
    message_id: msg.key?.id || null,
  };

  const url = resolveWebhookUrl();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[whatsapp-inbound] webhook failed", res.status, body.slice(0, 300));
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[whatsapp-inbound] webhook fetch error", errMsg);
  }
}

function registerInboundHandler(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key?.fromMe) continue;
      try {
        await forwardInbound(sock, msg);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error("[whatsapp-inbound] handler error", errMsg);
      }
    }
  });
}

module.exports = { registerInboundHandler };
