import { NextResponse } from "next/server";
import { resolveWhatsAppServiceBase } from "@/lib/whatsapp-service-url";

type Body = { phone?: string; code?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const base = resolveWhatsAppServiceBase();
  if (!base) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_SERVICE_URL not configured. OTP verification requires the always-on WhatsApp service. On Netlify, add WHATSAPP_SERVICE_URL in Site settings → Environment variables.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${base}/api/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: body.phone, code: body.code }),
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

