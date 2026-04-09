import { NextResponse } from "next/server";

type Body = { phone?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const base = (process.env.WHATSAPP_SERVICE_URL || "").trim();
  if (!base) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_SERVICE_URL not configured. OTP sending requires the always-on WhatsApp service.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${base.replace(/\\/$/, "")}/api/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: body.phone }),
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

