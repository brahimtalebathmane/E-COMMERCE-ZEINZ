import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  product_id: string;
  customer_name?: string;
  phone?: string;
  address?: string;
  payment_method?: string;
  payment_number?: string;
  transaction_reference?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product_id) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, discount_price, price")
    .eq("id", body.product_id)
    .maybeSingle();

  if (pErr || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const total =
    product.discount_price != null
      ? Number(product.discount_price)
      : Number(product.price);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      product_id: body.product_id,
      customer_name: body.customer_name ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      payment_method: body.payment_method ?? null,
      payment_number: body.payment_number ?? null,
      transaction_reference: body.transaction_reference ?? null,
      total_price: total,
      status: "pending",
      form_data: {},
    })
    .select("id, completion_token, total_price")
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 500 });
  }

  return NextResponse.json({
    order_id: order.id,
    completion_token: order.completion_token,
    total_price: order.total_price,
  });
}
