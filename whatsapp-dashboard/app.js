const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const qrBox = document.getElementById("qrBox");
const connectedBox = document.getElementById("connectedBox");
const reconnectBtn = document.getElementById("reconnectBtn");
const qrImg = document.getElementById("qrImg");
const logsList = document.getElementById("logsList");

function setError(message) {
  statusDot.classList.remove("connected", "disconnected", "qr");
  statusDot.classList.add("error");
  statusText.textContent = message;
  qrBox.classList.add("hidden");
  connectedBox.classList.add("hidden");
  reconnectBtn.disabled = false;
  reconnectBtn.classList.remove("hidden");
}

function setStatus(status) {
  statusDot.classList.remove("connected", "disconnected", "qr", "error");
  if (status === "connected") {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
    qrBox.classList.add("hidden");
    connectedBox.classList.remove("hidden");
    reconnectBtn.disabled = true;
    reconnectBtn.classList.add("hidden");
  } else if (status === "qr") {
    statusDot.classList.add("qr");
    statusText.textContent = "Waiting for scan";
    qrBox.classList.remove("hidden");
    connectedBox.classList.add("hidden");
    reconnectBtn.disabled = true;
    reconnectBtn.classList.add("hidden");
  } else {
    statusDot.classList.add("disconnected");
    statusText.textContent = "Disconnected";
    qrBox.classList.add("hidden");
    connectedBox.classList.add("hidden");
    reconnectBtn.disabled = false;
    reconnectBtn.classList.remove("hidden");
  }
}

async function refreshStatus() {
  const res = await fetch("/api/status", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  const st = json.status;
  if (st !== "connected" && st !== "qr" && st !== "disconnected") {
    throw new Error("Invalid status");
  }
  setStatus(st);
  return st;
}

async function refreshQrIfNeeded() {
  let status;
  try {
    status = await refreshStatus();
  } catch (e) {
    console.warn("[whatsapp-dashboard] refreshStatus failed", e);
    return;
  }
  if (status !== "qr") return;

  try {
    const res = await fetch("/api/qr", { cache: "no-store", credentials: "same-origin" });
    const json = await res.json();
    if (res.ok && json.dataUrl) {
      qrImg.src = json.dataUrl;
    }
  } catch (e) {
    console.warn("[whatsapp-dashboard] refreshQr failed", e);
  }
}

async function refreshLogs() {
  try {
    const res = await fetch("/api/logs", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return;
    const json = await res.json();
    const logs = Array.isArray(json.logs) ? json.logs : [];
    logsList.innerHTML = "";
    for (const line of logs.slice().reverse()) {
      const li = document.createElement("li");
      li.textContent = line;
      logsList.appendChild(li);
    }
  } catch (e) {
    console.warn("[whatsapp-dashboard] refreshLogs failed", e);
  }
}

reconnectBtn.addEventListener("click", async () => {
  reconnectBtn.disabled = true;
  try {
    const res = await fetch("/api/reconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "same-origin",
    });
    if (!res.ok) {
      console.warn("[whatsapp-dashboard] reconnect HTTP", res.status);
    }
  } catch (e) {
    console.warn("[whatsapp-dashboard] reconnect failed", e);
  } finally {
    setTimeout(() => {
      void refreshQrIfNeeded();
      void refreshLogs();
    }, 600);
  }
});

async function init() {
  connectedBox.classList.add("hidden");
  try {
    await refreshStatus();
  } catch (e) {
    console.error("[whatsapp-dashboard] init", e);
    setError("Cannot reach API — check deploy / network");
    return;
  }
  await refreshLogs();
  await refreshQrIfNeeded();
}

void init();

setInterval(() => {
  void refreshStatus().catch((e) => console.warn("[whatsapp-dashboard] poll status", e));
}, 3000);

setInterval(() => {
  void refreshQrIfNeeded();
}, 5000);

setInterval(() => {
  void refreshLogs();
}, 5000);
