const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const qrBox = document.getElementById("qrBox");
const connectedBox = document.getElementById("connectedBox");
const reconnectBtn = document.getElementById("reconnectBtn");
const qrImg = document.getElementById("qrImg");
const logsList = document.getElementById("logsList");

function setStatus(status) {
  statusDot.classList.remove("connected", "disconnected", "qr");
  if (status === "connected") {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
    qrBox.classList.add("hidden");
    connectedBox.classList.remove("hidden");
    reconnectBtn.disabled = true;
  } else if (status === "qr") {
    statusDot.classList.add("qr");
    statusText.textContent = "Waiting for scan";
    qrBox.classList.remove("hidden");
    connectedBox.classList.add("hidden");
    reconnectBtn.disabled = true;
  } else {
    statusDot.classList.add("disconnected");
    statusText.textContent = "Disconnected";
    qrBox.classList.add("hidden");
    connectedBox.classList.add("hidden");
    reconnectBtn.disabled = false;
  }
}

async function refreshStatus() {
  const res = await fetch("/api/status", { cache: "no-store" });
  const json = await res.json();
  setStatus(json.status);
  return json.status;
}

async function refreshQrIfNeeded() {
  const status = await refreshStatus();
  if (status !== "qr") return;

  try {
    const res = await fetch("/api/qr", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.dataUrl) {
      qrImg.src = json.dataUrl;
    }
  } catch {
    // ignore
  }
}

async function refreshLogs() {
  const res = await fetch("/api/logs", { cache: "no-store" });
  const json = await res.json();
  const logs = Array.isArray(json.logs) ? json.logs : [];
  logsList.innerHTML = "";
  for (const line of logs.slice().reverse()) {
    const li = document.createElement("li");
    li.textContent = line;
    logsList.appendChild(li);
  }
}

reconnectBtn.addEventListener("click", async () => {
  reconnectBtn.disabled = true;
  try {
    await fetch("/api/reconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // ignore
  } finally {
    setTimeout(() => {
      void refreshQrIfNeeded();
      void refreshLogs();
    }, 600);
  }
});

// Pollers
setStatus("disconnected");
connectedBox.classList.add("hidden");

void refreshQrIfNeeded();
void refreshLogs();

// status every 3s; QR every 5s (only if not connected)
setInterval(() => {
  void refreshStatus();
}, 3000);

setInterval(() => {
  void refreshQrIfNeeded();
}, 5000);

setInterval(() => {
  void refreshLogs();
}, 5000);

