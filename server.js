const path = require("path");
const express = require("express");
const next = require("next");

const {
  getStatus,
  getLogs,
  getQrDataUrl,
  reconnectWhatsApp,
  sendWhatsAppMessage,
  waitForConnected,
  normalizeE164,
  getConnectionInfo,
} = require("./whatsapp");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = express();
  server.use(express.json({ limit: "1mb" }));

  const dashboardDir = path.join(__dirname, "whatsapp-dashboard");
  server.use("/whatsapp-dashboard", express.static(dashboardDir));

  server.get("/", (_req, res) => {
    res.sendFile(path.join(dashboardDir, "index.html"));
  });

  server.get("/api/status", (_req, res) => {
    const status = getStatus();
    res.json({ status, ...getConnectionInfo() });
  });

  server.get("/api/qr", async (_req, res) => {
    const status = getStatus();
    if (status !== "qr") {
      return res.status(404).json({ error: "No QR available" });
    }
    const dataUrl = await getQrDataUrl();
    if (!dataUrl) {
      return res.status(404).json({ error: "No QR available" });
    }
    return res.json({ dataUrl });
  });

  server.post("/api/reconnect", async (_req, res) => {
    await reconnectWhatsApp({ manual: true });
    res.json({ ok: true });
  });

  server.get("/api/logs", (_req, res) => {
    res.json({ logs: getLogs() });
  });

  /** Order confirmation template messages (Netlify resolves template; this host sends via Baileys). */
  server.post("/api/send-whatsapp", async (req, res) => {
    try {
      const phone = req.body?.phone;
      const message = req.body?.message;
      const phoneE164 = normalizeE164(phone);
      if (!phoneE164) return res.status(400).json({ error: "phone required" });
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message required" });
      }

      // eslint-disable-next-line no-console
      console.log("[POST /api/send-whatsapp] WhatsApp message trigger", {
        phone: phoneE164,
        previewLen: message.trim().length,
      });

      const connected = await waitForConnected(45000);
      if (!connected) {
        const st = getStatus();
        // eslint-disable-next-line no-console
        console.error("[POST /api/send-whatsapp] Baileys not connected", { status: st });
        return res.status(503).json({ error: "WhatsApp not connected" });
      }

      await sendWhatsAppMessage(phoneE164, message.trim());
      // eslint-disable-next-line no-console
      console.log("[POST /api/send-whatsapp] Message sent successfully", { phone: phoneE164 });
      return res.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[POST /api/send-whatsapp] send failed", msg);
      return res.status(500).json({ error: msg });
    }
  });

  // Delegate all other routes (including existing Next.js APIs) to Next.
  server.all(/.*/, (req, res) => handle(req, res));

  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://${host}:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
