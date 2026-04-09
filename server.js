const path = require("path");
const express = require("express");
const next = require("next");

const {
  getStatus,
  getLogs,
  getQrDataUrl,
  reconnectWhatsApp,
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
    res.json({ status });
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
    await reconnectWhatsApp();
    res.json({ ok: true });
  });

  server.get("/api/logs", (_req, res) => {
    res.json({ logs: getLogs() });
  });

  // Delegate all other routes (including existing Next.js APIs) to Next.
  server.all(/.*/, (req, res) => handle(req, res));

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

