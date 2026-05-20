import { NextResponse } from "next/server";
import { processWhatsAppInbound, type WhatsAppInboundPayload } from "@/lib/whatsapp/process-inbound";

function assertWebhookAuth(request: Request): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn("[webhooks/whatsapp] WHATSAPP_WEBHOOK_SECRET not set — rejecting");
    return false;
  }
  const header = request.headers.get("x-webhook-secret")?.trim();
  return header === secret;
}

export async function POST(request: Request) {
  if (!assertWebhookAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WhatsAppInboundPayload;
  try {
    body = (await request.json()) as WhatsAppInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }

  try {
    const result = await processWhatsAppInbound(body);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/webhooks/whatsapp]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
