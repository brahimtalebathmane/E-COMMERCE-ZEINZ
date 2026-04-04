import { NextResponse } from "next/server";
import { validatePostPaymentFormCompletion } from "@/lib/form-fields";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[GET /api/orders/:id]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      product_id,
      completion_token,
      form_data,
      total_price,
      status,
      products (
        id,
        name,
        description,
        slug,
        form_title,
        form_fields,
        meta_pixel_id,
        discount_price,
        price,
        media_type,
        media_url,
        features,
        gallery,
        testimonials,
        faqs,
        whatsapp_e164,
        created_at
      )
    `,
    )
    .eq("id", id)
    .eq("completion_token", token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ order: data });
}

type PatchBody = {
  completion_token: string;
  form_data?: Record<string, unknown>;
  customer_name?: string;
  phone?: string;
  address?: string;
  receipt_image_url?: string;
  transaction_reference?: string;
  payment_method?: string;
  payment_number?: string;
  confirm_purchase?: boolean;
};

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.completion_token) {
    return NextResponse.json({ error: "completion_token required" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select(
        "id, completion_token, form_data, product_id, total_price, receipt_image_url",
      )
      .eq("id", id)
      .eq("completion_token", body.completion_token)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextForm =
      body.form_data !== undefined
        ? { ...(existing.form_data as Record<string, unknown>), ...body.form_data }
        : (existing.form_data as Record<string, unknown>);

    if (body.confirm_purchase) {
      const { data: productRow, error: productErr } = await supabase
        .from("products")
        .select("form_fields")
        .eq("id", existing.product_id)
        .maybeSingle();

      if (productErr || !productRow) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const incomplete = validatePostPaymentFormCompletion(
        productRow.form_fields,
        nextForm as Record<string, unknown>,
      );
      if (incomplete) {
        return NextResponse.json({ error: incomplete }, { status: 400 });
      }
    }

    const patch: Record<string, unknown> = {};

    if (body.customer_name !== undefined) patch.customer_name = body.customer_name;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.address !== undefined) patch.address = body.address;
    if (body.receipt_image_url !== undefined)
      patch.receipt_image_url = body.receipt_image_url;
    if (body.transaction_reference !== undefined)
      patch.transaction_reference = body.transaction_reference;
    if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
    if (body.payment_number !== undefined) patch.payment_number = body.payment_number;
    if (body.form_data !== undefined) patch.form_data = nextForm;

    if (body.confirm_purchase) {
      patch.form_data = {
        ...nextForm,
        _purchase_confirmed_at: new Date().toISOString(),
      };
    }

    const { data: updated, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", id)
      .eq("completion_token", body.completion_token)
      .select(
        `
      id,
      product_id,
      total_price,
      form_data,
      products (
        id,
        name,
        slug,
        meta_pixel_id
      )
    `,
      )
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ order: updated, confirm_purchase: body.confirm_purchase });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[PATCH /api/orders/:id]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
