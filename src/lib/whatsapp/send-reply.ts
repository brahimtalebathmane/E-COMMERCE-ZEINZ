import { resolveWhatsAppServiceBase } from "@/lib/whatsapp-service-url";

const DOWNSTREAM_TIMEOUT_MS = 60_000;

export async function sendWhatsAppReply(
  phone: string,
  message: string,
): Promise<{ sent: boolean; error?: string }> {
  const base = resolveWhatsAppServiceBase();
  if (!base) {
    return { sent: false, error: "whatsapp_service_unconfigured" };
  }

  const url = `${base}/api/send-whatsapp`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DOWNSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message: message.trim() }),
      signal: ac.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { sent: false, error: json.error || `status_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
