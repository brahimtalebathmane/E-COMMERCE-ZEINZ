import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAnyPermissionApi } from "@/lib/auth/api-access";
import { PERMISSIONS } from "@/lib/auth/permissions";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export async function POST(request: Request) {
  const admin = await requireAnyPermissionApi([PERMISSIONS.manage_products, PERMISSIONS.marketing_messages]);
  if (!admin.ok) {
    return admin.response;
  }

  const formData = await request.formData();
  const image = formData.get("file");
  const folderRaw = String(formData.get("folder") ?? "testimonials").trim();
  const folder = folderRaw.replace(/[^a-zA-Z0-9/_-]/g, "") || "testimonials";

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, WebP, or GIF is allowed." }, { status: 400 });
  }
  if (image.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be 5MB or smaller." }, { status: 400 });
  }

  const arrayBuffer = await image.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const ext = extensionFromMime(image.type);
  const path = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;

  const service = createServiceClient();
  // public-assets (not user-assets) — landing/marketing images only, never
  // customer-private data. Public bucket → a stable public URL that never
  // expires and never breaks on a Supabase signing-key rotation, unlike the
  // old 5-year signed URL. See migration 056_public_assets_bucket.sql.
  const { error: uploadError } = await service.storage
    .from("public-assets")
    .upload(path, bytes, {
      contentType: image.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = service.storage.from("public-assets").getPublicUrl(path);

  return NextResponse.json({
    path,
    url: pub.publicUrl,
  });
}
