import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth/api-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveWhatsAppServiceBase } from "@/lib/whatsapp-service-url";

/**
 * Server-side proxy to the Railway WhatsApp service's GET /status. The admin
 * panel must never call that service directly from the browser — this route
 * is the only thing that does, keeping MARKETING_SENDER_API_KEY server-only.
 */
export async function GET() {
  const admin = await requirePermissionApi(PERMISSIONS.marketing_messages);
  if (!admin.ok) {
    return admin.response;
  }

  const base =
    (process.env.MARKETING_SENDER_URL || "").trim().replace(/\/$/, "") ||
    resolveWhatsAppServiceBase();
  if (!base) {
    return NextResponse.json({ connected: false, error: "Sender service not configured." });
  }

  try {
    const res = await fetch(`${base}/status`, {
      headers: { "x-api-key": process.env.MARKETING_SENDER_API_KEY || "" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ connected: false, error: `Status check returned ${res.status}` });
    }
    const json = (await res.json()) as { connected?: boolean };
    return NextResponse.json({ connected: Boolean(json.connected) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ connected: false, error: msg });
  }
}
