import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateReceiptFile } from "@/lib/upload-validation";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const orderId = form.get("order_id")?.toString();
  const completionToken = form.get("completion_token")?.toString();

  if (!(file instanceof File) || !orderId || !completionToken) {
    return NextResponse.json(
      { error: "file, order_id, and completion_token required" },
      { status: 400 },
    );
  }

  const err = validateReceiptFile(file);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("completion_token", completionToken)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ error: "Invalid order" }, { status: 403 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
    ? ext
    : "jpg";
  const path = `receipts/${orderId}/${crypto.randomUUID()}.${safeExt}`;

  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("user-assets")
    .upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    storage_path: path,
  });
}
